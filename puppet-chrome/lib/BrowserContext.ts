import { assert } from '@ulixee/commons/lib/utils';
import IPuppetContext, {
  IPuppetContextEvents,
  IPuppetPageOptions,
} from '@ulixee/hero-interfaces/IPuppetContext';
import { ICookie } from '@ulixee/hero-interfaces/ICookie';
import EventSubscriber from '@ulixee/commons/lib/EventSubscriber';
import { URL } from 'url';
import Protocol from 'devtools-protocol';
import { TypedEventEmitter } from '@ulixee/commons/lib/eventUtils';
import { IBoundLog } from '@ulixee/commons/interfaces/ILog';
import { CanceledPromiseError } from '@ulixee/commons/interfaces/IPendingWaitEvent';
import { IPuppetWorker } from '@ulixee/hero-interfaces/IPuppetWorker';
import ProtocolMapping from 'devtools-protocol/types/protocol-mapping';
import ICorePlugins from '@ulixee/hero-interfaces/ICorePlugins';
import { IPuppetPage } from '@ulixee/hero-interfaces/IPuppetPage';
import IProxyConnectionOptions from '@ulixee/hero-interfaces/IProxyConnectionOptions';
import Resolvable from '@ulixee/commons/lib/Resolvable';
import {
  IDevtoolsEventMessage,
  IDevtoolsResponseMessage,
} from '@ulixee/hero-interfaces/IDevtoolsSession';
import { Page } from './Page';
import { Browser } from './Browser';
import { DevtoolsSession } from './DevtoolsSession';
import Frame from './Frame';
import IDomStorage from '@ulixee/hero-interfaces/IDomStorage';
import CookieParam = Protocol.Network.CookieParam;
import TargetInfo = Protocol.Target.TargetInfo;

export class BrowserContext
  extends TypedEventEmitter<IPuppetContextEvents>
  implements IPuppetContext
{
  public logger: IBoundLog;

  public workersById = new Map<string, IPuppetWorker>();
  public pagesById = new Map<string, Page>();
  public devtoolsSessionsById = new Map<string, DevtoolsSession>();
  public plugins: ICorePlugins;
  public proxy: IProxyConnectionOptions;
  public domStorage: IDomStorage;
  public readonly id: string;

  public get browserId(): string {
    return this.browser.id;
  }

  public isIncognito = true;

  private attachedTargetIds = new Set<string>();
  private pageOptionsByTargetId = new Map<string, IPuppetPageOptions>();
  private readonly createdTargetIds = new Set<string>();
  private creatingTargetPromises: Promise<void>[] = [];
  private waitForPageAttachedById = new Map<string, Resolvable<Page>>();
  private readonly browser: Browser;

  private isClosing = false;

  private devtoolsSessions = new WeakSet<DevtoolsSession>();
  private readonly events = new EventSubscriber();
  private browserContextInitiatedMessageIds = new Set<number>();

  constructor(
    browser: Browser,
    plugins: ICorePlugins,
    contextId: string,
    logger: IBoundLog,
    proxy?: IProxyConnectionOptions,
  ) {
    super();
    this.plugins = plugins;
    this.browser = browser;
    this.id = contextId;
    this.isIncognito = !!contextId;
    this.logger = logger.createChild(module, {
      browserContextId: contextId,
    });
    this.proxy = proxy;

    this.subscribeToDevtoolsMessages(this.browser.devtoolsSession, {
      sessionType: 'browser',
    });
  }

  public defaultPageInitializationFn: (page: IPuppetPage) => Promise<any> = () => Promise.resolve();

  async newPage(options?: IPuppetPageOptions): Promise<Page> {
    const createTargetPromise = new Resolvable<void>();
    this.creatingTargetPromises.push(createTargetPromise.promise);

    const { targetId } = await this.sendWithBrowserDevtoolsSession('Target.createTarget', {
      url: 'about:blank',
      browserContextId: this.id,
      background: options ? true : undefined,
    });
    this.createdTargetIds.add(targetId);
    this.pageOptionsByTargetId.set(targetId, options);

    await this.attachToTarget(targetId);

    createTargetPromise.resolve();
    const idx = this.creatingTargetPromises.indexOf(createTargetPromise.promise);
    if (idx >= 0) this.creatingTargetPromises.splice(idx, 1);

    let page = this.pagesById.get(targetId);
    if (!page) {
      const pageAttachedPromise = new Resolvable<Page>(
        60e3,
        'Error creating page. Timed-out waiting to attach',
      );
      this.waitForPageAttachedById.set(targetId, pageAttachedPromise);
      page = await pageAttachedPromise.promise;
      this.waitForPageAttachedById.delete(targetId);
    }

    await page.isReady;
    if (page.isClosed) throw new Error('Page has been closed.');
    return page;
  }

  initializePage(page: Page): Promise<any> {
    if (this.pageOptionsByTargetId.get(page.targetId)?.runPageScripts === false)
      return Promise.resolve();

    return Promise.all([
      this.defaultPageInitializationFn(page),
      this.plugins.onNewPuppetPage(page),
    ]);
  }

  async onPageAttached(devtoolsSession: DevtoolsSession, targetInfo: TargetInfo): Promise<Page> {
    this.attachedTargetIds.add(targetInfo.targetId);
    await Promise.all(this.creatingTargetPromises);
    if (this.pagesById.has(targetInfo.targetId)) return;

    this.subscribeToDevtoolsMessages(devtoolsSession, {
      sessionType: 'page',
      pageTargetId: targetInfo.targetId,
    });

    const pageOptions = this.pageOptionsByTargetId.get(targetInfo.targetId);

    let opener = targetInfo.openerId ? this.pagesById.get(targetInfo.openerId) || null : null;
    if (pageOptions?.triggerPopupOnPageId) {
      opener = this.pagesById.get(pageOptions.triggerPopupOnPageId);
    }
    // make the first page the active page
    if (!opener && !this.createdTargetIds.has(targetInfo.targetId)) {
      opener = this.pagesById.values().next().value;
    }

    const page = new Page(
      devtoolsSession,
      targetInfo.targetId,
      this,
      this.logger,
      opener,
      pageOptions,
    );
    this.pagesById.set(page.targetId, page);
    this.waitForPageAttachedById.get(page.targetId)?.resolve(page);
    await page.isReady;
    this.emit('page', { page });
    return page;
  }

  onPageDetached(targetId: string): void {
    this.attachedTargetIds.delete(targetId);
    const page = this.pagesById.get(targetId);
    if (page) {
      this.pagesById.delete(targetId);
      page.didClose();
      return;
    }

    const devtoolsSession = this.devtoolsSessionsById.get(targetId);
    if (devtoolsSession) {
      this.onDevtoolsPanelDetached(devtoolsSession);
    }
  }

  onDevtoolsPanelAttached(devtoolsSession: DevtoolsSession, targetInfo: TargetInfo): void {
    this.devtoolsSessionsById.set(targetInfo.targetId, devtoolsSession);
    this.plugins.onDevtoolsPanelAttached(devtoolsSession).catch(() => null);
  }

  onDevtoolsPanelDetached(devtoolsSession: DevtoolsSession): void {
    this.plugins.onDevtoolsPanelDetached(devtoolsSession).catch(() => null);
  }

  async onSharedWorkerAttached(
    devtoolsSession: DevtoolsSession,
    targetInfo: TargetInfo,
  ): Promise<void> {
    const page: Page =
      [...this.pagesById.values()].find(x => !x.isClosed) ?? this.pagesById.values().next().value;
    await page.onWorkerAttached(devtoolsSession, targetInfo);
  }

  beforeWorkerAttached(
    devtoolsSession: DevtoolsSession,
    workerTargetId: string,
    pageTargetId: string,
  ): void {
    this.subscribeToDevtoolsMessages(devtoolsSession, {
      sessionType: 'worker' as const,
      pageTargetId,
      workerTargetId,
    });
  }

  onWorkerAttached(worker: IPuppetWorker): void {
    this.workersById.set(worker.id, worker);
    this.events.once(worker,'close', () => this.workersById.delete(worker.id));
    this.emit('worker', { worker });
  }

  targetDestroyed(targetId: string): void {
    this.attachedTargetIds.delete(targetId);
    const page = this.pagesById.get(targetId);
    if (page) page.didClose();
  }

  targetKilled(targetId: string, errorCode: number): void {
    const page = this.pagesById.get(targetId);
    if (page) page.onTargetKilled(errorCode);
  }

  async attachToTarget(targetId: string): Promise<void> {
    // chrome 80 still needs you to manually attach
    if (!this.attachedTargetIds.has(targetId)) {
      await this.sendWithBrowserDevtoolsSession('Target.attachToTarget', {
        targetId,
        flatten: true,
      });
    }
  }

  async attachToWorker(targetInfo: TargetInfo): Promise<void> {
    await this.sendWithBrowserDevtoolsSession('Target.attachToTarget', {
      targetId: targetInfo.targetId,
      flatten: true,
    });
  }

  async close(): Promise<void> {
    if (this.isClosing) return;
    this.isClosing = true;

    for (const waitingPage of this.waitForPageAttachedById.values()) {
      await waitingPage.reject(new CanceledPromiseError('BrowserContext shutting down'));
    }
    if (this.browser.devtoolsSession.isConnected()) {
      await Promise.all([...this.pagesById.values()].map(x => x.close()));
      // can only close with id
      if (this.id) {
        await this.sendWithBrowserDevtoolsSession('Target.disposeBrowserContext', {
          browserContextId: this.id,
        }).catch(err => {
          if (err instanceof CanceledPromiseError) return;
          throw err;
        });
      }
    }
    this.events.close();
    this.emit('close');
    this.removeAllListeners();
  }

  async getCookies(url?: URL): Promise<ICookie[]> {
    const { cookies } = await this.sendWithBrowserDevtoolsSession('Storage.getCookies', {
      browserContextId: this.id,
    });
    return cookies
      .map(c => {
        return <ICookie>{
          name: c.name,
          value: c.value,
          secure: c.secure,
          sameSite: c.sameSite ?? 'None',
          sameParty: (c as any).sameParty,
          expires: c.expires === -1 ? undefined : new Date(c.expires * 1000).toISOString(),
          httpOnly: c.httpOnly,
          path: c.path,
          domain: c.domain,
        };
      })
      .filter(c => {
        if (!url) return true;

        if (url.hostname !== c.domain && !url.hostname.includes(c.domain)) return false;
        if (!url.pathname.startsWith(c.path)) return false;
        if (c.secure === true && url.protocol !== 'https:') return false;
        return true;
      });
  }

  async addCookies(
    cookies: (Omit<ICookie, 'expires'> & { expires?: string | Date | number })[],
    origins?: string[],
  ): Promise<void> {
    const originUrls = (origins ?? []).map(x => new URL(x));
    const parsedCookies: CookieParam[] = [];
    for (const cookie of cookies) {
      assert(cookie.name, 'Cookie should have a name');
      assert(cookie.value !== undefined && cookie.value !== null, 'Cookie should have a value');
      assert(cookie.domain || cookie.url, 'Cookie should have a domain or url');

      let expires = cookie.expires ?? -1;
      if (expires && typeof expires === 'string') {
        if (expires === '-1') {
          expires = undefined;
        } else if (expires.match(/^[.\d]+$/)) {
          expires = parseInt(expires, 10);
          if (expires > 1e10) expires = expires / 1e3;
        } else {
          expires = new Date(expires).getTime() / 1e3;
        }
      } else if (expires && expires instanceof Date) {
        expires = expires.getTime() / 1e3;
      }

      const cookieToSend: CookieParam = {
        ...cookie,
        expires: expires as number,
      };

      if (!cookieToSend.url) {
        cookieToSend.url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
        const match = originUrls.find(x => {
          return x.hostname.endsWith(cookie.domain);
        });
        if (match) cookieToSend.url = match.href;
      }

      // chrome won't allow same site not for non-secure cookies
      if (!cookie.secure && cookie.sameSite === 'None') {
        delete cookieToSend.sameSite;
      }

      parsedCookies.push(cookieToSend);
    }
    await this.sendWithBrowserDevtoolsSession('Storage.setCookies', {
      cookies: parsedCookies,
      browserContextId: this.id,
    });
  }

  sendWithBrowserDevtoolsSession<T extends keyof ProtocolMapping.Commands>(
    method: T,
    params: ProtocolMapping.Commands[T]['paramsType'][0] = {},
  ): Promise<ProtocolMapping.Commands[T]['returnType']> {
    return this.browser.devtoolsSession.send(method, params, this);
  }

  private subscribeToDevtoolsMessages(
    devtoolsSession: DevtoolsSession,
    details: Pick<
      IPuppetContextEvents['devtools-message'],
      'pageTargetId' | 'sessionType' | 'workerTargetId'
    >,
  ): void {
    if (this.devtoolsSessions.has(devtoolsSession)) return;

    this.devtoolsSessions.add(devtoolsSession);
    const shouldFilter = details.sessionType === 'browser';

    this.events.on(devtoolsSession.messageEvents, 'receive', event => {
      if (shouldFilter) {
        // see if this was initiated by this browser context
        const { id } = event as IDevtoolsResponseMessage;
        if (id && !this.browserContextInitiatedMessageIds.has(id)) return;

        // see if this has a browser context target
        const target = (event as IDevtoolsEventMessage).params?.targetInfo as TargetInfo;
        if (target && target.browserContextId && target.browserContextId !== this.id) return;
      }
      this.emit('devtools-message', {
        direction: 'receive',
        ...details,
        ...event,
      });
    });
    this.events.on(devtoolsSession.messageEvents, 'send', (event, initiator) => {
      if (shouldFilter) {
        if (initiator && initiator !== this) return;
        this.browserContextInitiatedMessageIds.add(event.id);
      }
      if (initiator && initiator instanceof Frame) {
        (event as any).frameId = initiator.id;
      }
      this.emit('devtools-message', {
        direction: 'send',
        ...details,
        ...event,
      });
    });
  }
}

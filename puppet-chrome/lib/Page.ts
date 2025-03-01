/**
 * Copyright 2018 Google Inc. All rights reserved.
 * Modifications copyright (c) Data Liberation Foundation Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import Protocol from 'devtools-protocol';
import { IPuppetPage, IPuppetPageEvents } from '@ulixee/hero-interfaces/IPuppetPage';
import { TypedEventEmitter } from '@ulixee/commons/lib/eventUtils';
import { assert, createPromise } from '@ulixee/commons/lib/utils';
import EventSubscriber from '@ulixee/commons/lib/EventSubscriber';
import IRegisteredEventListener from '@ulixee/commons/interfaces/IRegisteredEventListener';
import { IBoundLog } from '@ulixee/commons/interfaces/ILog';
import { CanceledPromiseError } from '@ulixee/commons/interfaces/IPendingWaitEvent';
import { DevtoolsSession } from './DevtoolsSession';
import { NetworkManager } from './NetworkManager';
import { Keyboard } from './Keyboard';
import Mouse from './Mouse';
import FramesManager from './FramesManager';
import { BrowserContext } from './BrowserContext';
import { Worker } from './Worker';
import ConsoleMessage from './ConsoleMessage';
import Frame from './Frame';
import IScreenshotOptions from '@ulixee/hero-interfaces/IScreenshotOptions';
import { DomStorageTracker } from './DomStorageTracker';
import { IPuppetPageOptions } from '@ulixee/hero-interfaces/IPuppetContext';
import ConsoleAPICalledEvent = Protocol.Runtime.ConsoleAPICalledEvent;
import ExceptionThrownEvent = Protocol.Runtime.ExceptionThrownEvent;
import WindowOpenEvent = Protocol.Page.WindowOpenEvent;
import TargetInfo = Protocol.Target.TargetInfo;
import JavascriptDialogOpeningEvent = Protocol.Page.JavascriptDialogOpeningEvent;
import FileChooserOpenedEvent = Protocol.Page.FileChooserOpenedEvent;
import Size = Protocol.SystemInfo.Size;
import Rect = Protocol.DOM.Rect;
import SetDeviceMetricsOverrideRequest = Protocol.Emulation.SetDeviceMetricsOverrideRequest;
import Viewport = Protocol.Page.Viewport;

export class Page extends TypedEventEmitter<IPuppetPageEvents> implements IPuppetPage {
  public keyboard: Keyboard;
  public mouse: Mouse;
  public workersById = new Map<string, Worker>();
  public readonly browserContext: BrowserContext;
  public readonly opener: Page | null;
  public networkManager: NetworkManager;
  public framesManager: FramesManager;
  public domStorageTracker: DomStorageTracker;
  public groupName: string;

  public popupInitializeFn?: (
    page: IPuppetPage,
    openParams: { url: string; windowName: string },
  ) => Promise<any>;

  public devtoolsSession: DevtoolsSession;
  public targetId: string;
  public isClosed = false;
  public readonly isReady: Promise<void>;
  public windowOpenParams: Protocol.Page.WindowOpenEvent;

  public get id(): string {
    return this.targetId;
  }

  public get mainFrame(): Frame {
    return this.framesManager.main;
  }

  public get frames(): Frame[] {
    return this.framesManager.activeFrames;
  }

  public get workers(): Worker[] {
    return [...this.workersById.values()];
  }

  protected readonly logger: IBoundLog;
  private isClosing = false;
  private closePromise = createPromise();
  private readonly events = new EventSubscriber();

  constructor(
    devtoolsSession: DevtoolsSession,
    targetId: string,
    browserContext: BrowserContext,
    logger: IBoundLog,
    opener: Page | null,
    pageOptions?: IPuppetPageOptions,
  ) {
    super();

    this.groupName = pageOptions?.groupName;
    this.logger = logger.createChild(module, {
      targetId,
    });
    this.logger.info('Page.created');
    this.storeEventsWithoutListeners = true;
    this.devtoolsSession = devtoolsSession;
    this.targetId = targetId;
    this.browserContext = browserContext;
    this.keyboard = new Keyboard(devtoolsSession);
    this.mouse = new Mouse(devtoolsSession, this.keyboard);
    this.networkManager = new NetworkManager(
      devtoolsSession,
      this.logger,
      this.browserContext.proxy,
    );
    this.domStorageTracker = new DomStorageTracker(
      this,
      browserContext.domStorage,
      this.networkManager,
      this.logger,
      pageOptions?.enableDomStorageTracker ?? true,
    );
    this.framesManager = new FramesManager(
      devtoolsSession,
      this.networkManager,
      this.domStorageTracker,
      this.logger,
    );
    this.opener = opener;

    this.setEventsToLog([
      'frame-created',
      'websocket-frame',
      'websocket-handshake',
      'navigation-response',
      'worker',
    ]);

    this.framesManager.addEventEmitter(this, ['frame-created']);
    this.domStorageTracker.addEventEmitter(this, ['dom-storage-updated']);
    this.networkManager.addEventEmitter(this, [
      'navigation-response',
      'websocket-frame',
      'websocket-handshake',
      'resource-will-be-requested',
      'resource-was-requested',
      'resource-loaded',
      'resource-failed',
    ]);

    this.devtoolsSession.once('disconnected', this.emit.bind(this, 'close'));

    const session = this.devtoolsSession;
    this.events.on(session, 'Inspector.targetCrashed', this.onTargetCrashed.bind(this));
    this.events.on(session, 'Runtime.exceptionThrown', this.onRuntimeException.bind(this));
    this.events.on(session, 'Runtime.consoleAPICalled', this.onRuntimeConsole.bind(this));
    this.events.on(session, 'Target.attachedToTarget', this.onAttachedToTarget.bind(this));
    this.events.on(
      session,
      'Page.javascriptDialogOpening',
      this.onJavascriptDialogOpening.bind(this),
    );
    this.events.on(session, 'Page.fileChooserOpened', this.onFileChooserOpened.bind(this));
    this.events.on(session, 'Page.windowOpen', this.onWindowOpen.bind(this));
    this.events.on(session, 'Page.screencastFrame', this.onScreencastFrame.bind(this));

    this.isReady = this.initialize().catch(error => {
      this.logger.error('Page.initializationError', {
        error,
      });
      throw error;
    });
  }

  async setNetworkRequestInterceptor(
    networkRequestsFn: (
      request: Protocol.Fetch.RequestPausedEvent,
    ) => Promise<Protocol.Fetch.FulfillRequestRequest>,
  ): Promise<void> {
    return await this.networkManager.setNetworkInterceptor(networkRequestsFn, true);
  }

  addNewDocumentScript(
    script: string,
    isolatedEnvironment: boolean,
  ): Promise<{ identifier: string }> {
    return this.framesManager.addNewDocumentScript(script, isolatedEnvironment);
  }

  removeDocumentScript(identifier: string): Promise<void> {
    return this.devtoolsSession.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }

  addPageCallback(
    name: string,
    onCallback?: (payload: any, frameId: string) => any,
    isolateFromWebPageEnvironment?: boolean,
  ): Promise<IRegisteredEventListener> {
    return this.framesManager.addPageCallback(
      name,
      (payload, frameId) => {
        if (onCallback) onCallback(payload, frameId);

        this.emit('page-callback-triggered', {
          name,
          payload,
          frameId,
        });
      },
      isolateFromWebPageEnvironment,
    );
  }

  async setJavaScriptEnabled(enabled: boolean): Promise<void> {
    await this.devtoolsSession.send('Emulation.setScriptExecutionDisabled', {
      value: !enabled,
    });
  }

  evaluate<T>(expression: string): Promise<T> {
    return this.mainFrame.evaluate<T>(expression, false);
  }

  async navigate(url: string, options: { referrer?: string } = {}): Promise<{ loaderId: string }> {
    const navigationResponse = await this.devtoolsSession.send('Page.navigate', {
      url,
      referrer: options.referrer,
      frameId: this.mainFrame.id,
    });
    if (navigationResponse.errorText) throw new Error(navigationResponse.errorText);
    await this.framesManager.waitForFrame(navigationResponse, url, true);
    return { loaderId: navigationResponse.loaderId };
  }

  dismissDialog(accept: boolean, promptText?: string): Promise<void> {
    return this.devtoolsSession.send('Page.handleJavaScriptDialog', {
      accept,
      promptText,
    });
  }

  goBack(): Promise<string> {
    return this.navigateToHistory(-1);
  }

  goForward(): Promise<string> {
    return this.navigateToHistory(+1);
  }

  reload(): Promise<void> {
    return this.devtoolsSession.send('Page.reload');
  }

  async bringToFront(): Promise<void> {
    await this.devtoolsSession.send('Page.bringToFront');
  }

  async screenshot(options: IScreenshotOptions): Promise<Buffer> {
    options ??= {};
    const quality = options.jpegQuality ?? 100;
    const clipRect = options.rectangle;
    const format = options.format ?? 'jpeg';
    assert(
      quality >= 0 && quality <= 100,
      `Expected options.quality to be between 0 and 100 (inclusive), got ${quality}`,
    );

    const { viewportSize } = await this.mainFrame.evaluate<{
      viewportSize: Size;
      scrollHeight: number;
    }>(`(() => ({
        viewportSize: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        scrollHeight: document.body.scrollHeight,
      }))()`);

    const layoutMetrics = await this.devtoolsSession.send('Page.getLayoutMetrics');

    const { scale, pageX, pageY }  = layoutMetrics.visualViewport;
    const contentSize = layoutMetrics.cssContentSize ?? layoutMetrics.contentSize;

    let resizeAfterScreenshot: SetDeviceMetricsOverrideRequest;
    let clip: Viewport;
    if (options.fullPage) {
      if (scale > 1) {
        contentSize.height = Math.floor(contentSize.height / scale);
        contentSize.width = Math.floor(contentSize.width / scale);
      }
      // Ignore current page scale when taking fullpage screenshots (based on the page content, not viewport),
      clip = { x: 0, y: 0, ...contentSize, scale: 1 };

      if (contentSize.width > viewportSize.width || contentSize.height > viewportSize.height) {
        await this.devtoolsSession.send('Emulation.setDeviceMetricsOverride', {
          ...contentSize,
          deviceScaleFactor: scale,
          mobile: false,
        });
        resizeAfterScreenshot = {
          ...viewportSize,
          deviceScaleFactor: scale,
          mobile: false,
        };
      }
    } else {
      const viewportRect = clipRect
        ? this.trimClipToSize(clipRect, viewportSize)
        : { x: 0, y: 0, ...viewportSize };
      clip = {
        x: pageX + viewportRect.x,
        y: pageY + viewportRect.y,
        width: Math.floor(viewportRect.width / scale),
        height: Math.floor(viewportRect.height / scale),
        scale,
      };
    }

    const timestamp = Date.now();
    const result = await this.devtoolsSession.send('Page.captureScreenshot', {
      format,
      quality,
      clip,
      captureBeyondViewport: true, // added in chrome 87
    } as Protocol.Page.CaptureScreenshotRequest);

    if (resizeAfterScreenshot) {
      await this.devtoolsSession.send('Emulation.setDeviceMetricsOverride', resizeAfterScreenshot);
    }

    this.emit('screenshot', {
      imageBase64: result.data,
      timestamp,
    });

    return Buffer.from(result.data, 'base64');
  }

  onWorkerAttached(
    devtoolsSession: DevtoolsSession,
    targetInfo: TargetInfo,
  ): Promise<Error | void> {
    const targetId = targetInfo.targetId;

    this.browserContext.beforeWorkerAttached(devtoolsSession, targetId, this.targetId);

    const worker = new Worker(
      this.browserContext,
      this.networkManager,
      devtoolsSession,
      this.logger,
      targetInfo,
    );
    if (worker.type !== 'shared_worker') this.workersById.set(targetId, worker);
    this.browserContext.onWorkerAttached(worker);

    this.events.on(worker, 'console', this.emit.bind(this, 'console'));
    this.events.on(worker, 'page-error', this.emit.bind(this, 'page-error'));
    this.events.on(worker, 'close', () => this.workersById.delete(targetId));

    this.emit('worker', { worker });
    return worker.isReady;
  }

  async close(options?: { timeoutMs?: number }): Promise<void> {
    if (this.isClosing || this.closePromise.isResolved) return this.closePromise.promise;
    this.isClosing = true;
    const parentLogId = this.logger.stats('Page.Closing');
    options ??= {};
    const timeoutMs = options.timeoutMs ?? 30e3;
    try {
      if (this.devtoolsSession.isConnected() && !this.isClosed) {
        const timeout = setTimeout(() => this.didClose(), timeoutMs);
        // trigger beforeUnload
        try {
          await this.devtoolsSession.send('Page.close');
        } catch (err) {
          if (!err.message.includes('Target closed') && !(err instanceof CanceledPromiseError)) {
            throw err;
          }
        }
        clearTimeout(timeout);
      } else {
        this.didClose();
      }
      await this.closePromise.promise;
    } finally {
      this.logger.stats('Page.Closed', { parentLogId });
    }
  }

  onTargetKilled(errorCode: number): void {
    this.emit('crashed', {
      error: new Error(`Page crashed - killed by Chrome with code ${errorCode}`),
      fatal: true,
    });
    this.didClose();
  }

  didClose(closeError?: Error): void {
    if (this.closePromise.isResolved) return;
    this.isClosed = true;
    try {
      this.framesManager.close(closeError);
      this.networkManager.close();
      this.domStorageTracker.close();
      this.events.close();
      this.cancelPendingEvents('Page closed', ['close']);
      for (const worker of this.workersById.values()) {
        worker.close();
      }
    } catch (error) {
      this.logger.error('Page.didClose().error', {
        error,
      });
    } finally {
      this.closePromise.resolve();
      this.emit('close');
      this.removeAllListeners();
    }
  }

  private async navigateToHistory(delta: number): Promise<string> {
    const history = await this.devtoolsSession.send('Page.getNavigationHistory');
    const entry = history.entries[history.currentIndex + delta];
    if (!entry) return null;
    await Promise.all([
      this.devtoolsSession.send('Page.navigateToHistoryEntry', { entryId: entry.id }),
      this.mainFrame.waitOn('frame-navigated'),
    ]);
    return entry.url;
  }

  private async initialize(): Promise<void> {
    const promises = [
      this.networkManager.initialize().catch(err => err),
      this.framesManager.initialize().catch(err => err),
      this.domStorageTracker.initialize().catch(err => err),
      this.devtoolsSession
        .send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: true,
        })
        .catch(err => err),
      this.browserContext.initializePage(this).catch(err => err),
      this.devtoolsSession
        .send('Page.setInterceptFileChooserDialog', { enabled: true })
        .catch(err => err),
      this.devtoolsSession.send('Runtime.runIfWaitingForDebugger').catch(err => err),
    ];

    for (const error of await Promise.all(promises)) {
      if (error && error instanceof Error) throw error;
    }

    if (this.opener && this.opener.popupInitializeFn) {
      this.logger.stats('Popup triggered', {
        targetId: this.targetId,
        opener: this.opener.targetId,
      });
      await this.opener.isReady;
      if (this.opener.isClosed) {
        this.logger.stats('Popup canceled', {
          targetId: this.targetId,
        });
        return;
      }
      if (this.mainFrame.isDefaultUrl) {
        // if we're on the default page, wait for a loader to be created before telling the page it's ready
        await this.mainFrame.waitOn('frame-loader-created', null, 2e3).catch(() => null);
        if (this.isClosed) return;
      }
      await this.opener.popupInitializeFn(this, this.opener.windowOpenParams);
      this.logger.stats('Popup initialized', {
        targetId: this.targetId,
        windowOpenParams: this.opener.windowOpenParams,
      });
    }
  }

  private onAttachedToTarget(event: Protocol.Target.AttachedToTargetEvent): Promise<any> {
    const { sessionId, targetInfo, waitingForDebugger } = event;

    const devtoolsSession = this.devtoolsSession.connection.getSession(sessionId);
    if (
      targetInfo.type === 'service_worker' ||
      targetInfo.type === 'shared_worker' ||
      targetInfo.type === 'worker'
    ) {
      return this.onWorkerAttached(devtoolsSession, targetInfo);
    }

    if (waitingForDebugger) {
      return devtoolsSession
        .send('Runtime.runIfWaitingForDebugger')
        .catch(error => {
          this.logger.error('Runtime.runIfWaitingForDebugger.Error', {
            error,
            devtoolsSessionId: sessionId,
          });
        })
        .then(() =>
          // detach from page session
          this.devtoolsSession.send('Target.detachFromTarget', { sessionId }),
        )
        .catch(error => {
          this.logger.error('Target.detachFromTarget', {
            error,
            devtoolsSessionId: sessionId,
          });
        });
    }
  }

  private onRuntimeException(msg: ExceptionThrownEvent): void {
    const error = ConsoleMessage.exceptionToError(msg.exceptionDetails);
    const frameId = this.framesManager.getFrameIdForExecutionContext(
      msg.exceptionDetails.executionContextId,
    );
    this.emit('page-error', {
      frameId,
      error,
    });
  }

  private onRuntimeConsole(event: ConsoleAPICalledEvent): void {
    const message = ConsoleMessage.create(this.devtoolsSession, event);
    const frameId = this.framesManager.getFrameIdForExecutionContext(event.executionContextId);

    this.emit('console', {
      frameId,
      ...message,
    });
  }

  private onTargetCrashed(): void {
    this.emit('crashed', { error: new Error('Target Crashed') });
  }

  private onWindowOpen(event: WindowOpenEvent): void {
    this.windowOpenParams = event;
  }

  private onJavascriptDialogOpening(dialog: JavascriptDialogOpeningEvent): void {
    this.emit('dialog-opening', { dialog });
  }

  private onFileChooserOpened(event: FileChooserOpenedEvent): void {
    this.framesManager.framesById
      .get(event.frameId)
      .resolveNodeId(event.backendNodeId)
      .then(objectId =>
        this.emit('filechooser', {
          objectId,
          frameId: event.frameId,
          selectMultiple: event.mode === 'selectMultiple',
        }),
      )
      .catch(() => null);
  }

  private onScreencastFrame(event: Protocol.Page.ScreencastFrameEvent): void {
    this.devtoolsSession
      .send('Page.screencastFrameAck', { sessionId: event.sessionId })
      .catch(() => null);

    this.emit('screenshot', {
      imageBase64: event.data,
      timestamp: event.metadata.timestamp * 1000,
    });
  }

  // COPIED FROM PLAYWRIGHT
  private trimClipToSize(clip: Rect, size: Size): Rect {
    const p1 = {
      x: Math.max(0, Math.min(clip.x, size.width)),
      y: Math.max(0, Math.min(clip.y, size.height)),
    };
    const p2 = {
      x: Math.max(0, Math.min(clip.x + clip.width, size.width)),
      y: Math.max(0, Math.min(clip.y + clip.height, size.height)),
    };
    const result = { x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y };
    assert(
      result.width && result.height,
      'Clipped area is either empty or outside the resulting image',
    );
    return result;
  }
}

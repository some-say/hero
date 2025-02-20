import ICoreRequestPayload from '@ulixee/hero-interfaces/ICoreRequestPayload';
import ICoreEventPayload from '@ulixee/hero-interfaces/ICoreEventPayload';
import ICoreResponsePayload from '@ulixee/hero-interfaces/ICoreResponsePayload';
import { bindFunctions, createPromise } from '@ulixee/commons/lib/utils';
import IResolvablePromise from '@ulixee/commons/interfaces/IResolvablePromise';
import Log from '@ulixee/commons/lib/Logger';
import ISessionCreateOptions from '@ulixee/hero-interfaces/ISessionCreateOptions';
import ISessionMeta from '@ulixee/hero-interfaces/ISessionMeta';
import { CanceledPromiseError } from '@ulixee/commons/interfaces/IPendingWaitEvent';
import ICoreConfigureOptions from '@ulixee/hero-interfaces/ICoreConfigureOptions';
import { TypedEventEmitter } from '@ulixee/commons/lib/eventUtils';
import SessionClosedOrMissingError from '@ulixee/commons/lib/SessionClosedOrMissingError';
import Resolvable from '@ulixee/commons/lib/Resolvable';
import ICoreConnectionEventPayload from '@ulixee/hero-interfaces/ICoreConnectionEventPayload';
import IConnectionToCoreOptions from '../interfaces/IConnectionToCoreOptions';
import CoreCommandQueue from '../lib/CoreCommandQueue';
import CoreSession from '../lib/CoreSession';
import CoreSessions from '../lib/CoreSessions';
import DisconnectedFromCoreError from './DisconnectedFromCoreError';
import { IHeroCreateOptions } from '../index';
import Hero from '../lib/Hero';
import { scriptInstance } from '../lib/internal';

const { log } = Log(module);

export default abstract class ConnectionToCore extends TypedEventEmitter<{
  disconnected: void;
  connected: void;
}> {
  public readonly commandQueue: CoreCommandQueue;
  public readonly hostOrError: Promise<string | Error>;
  public options: IConnectionToCoreOptions;
  public isDisconnecting: Promise<void>;
  public isConnectionTerminated = false;

  protected resolvedHost: string;

  private connectPromise: IResolvablePromise<Error | null>;
  private get connectOptions(): ICoreConfigureOptions & { isPersistent: boolean } {
    return {
      isPersistent: this.options.isPersistent,
      dataDir: this.options.dataDir,
    };
  }

  private connectRequestId: string;
  private disconnectRequestId: string;
  private didAutoConnect = false;
  private coreSessions: CoreSessions;
  private readonly pendingRequestsById = new Map<string, IResolvablePromiseWithId>();
  private lastId = 0;

  constructor(options?: IConnectionToCoreOptions) {
    super();
    this.options = options ?? { isPersistent: true };
    this.commandQueue = new CoreCommandQueue(null, scriptInstance.mode, this, null);
    this.coreSessions = new CoreSessions(
      this.options.maxConcurrency,
      this.options.instanceTimeoutMillis,
    );

    if (this.options.host) {
      this.hostOrError = Promise.resolve(this.options.host)
        .then(x => {
          if (!x.includes('://')) {
            return `ws://${x}`;
          }
          return x;
        })
        .then(x => {
          this.resolvedHost = x;
          return this.resolvedHost;
        })
        .catch(err => err);
    } else {
      this.hostOrError = Promise.resolve(new Error('No host provided'));
    }
    bindFunctions(this);
  }

  protected abstract internalSendRequest(payload: ICoreRequestPayload): Promise<void>;
  protected abstract createConnection(): Promise<Error | null>;
  protected abstract destroyConnection(): Promise<any>;

  public async connect(isAutoConnect = false): Promise<Error | null> {
    if (!this.connectPromise) {
      this.didAutoConnect = isAutoConnect;
      this.connectPromise = new Resolvable();
      try {
        const startTime = new Date();
        const connectError = await this.createConnection();
        if (connectError) throw connectError;
        if (this.isDisconnecting) {
          if (this.coreSessions.size > 0 && !this.didAutoConnect) {
            throw new DisconnectedFromCoreError(this.resolvedHost);
          }
          this.connectPromise.resolve();
        }

        // can be resolved if canceled by a disconnect
        if (this.connectPromise.isResolved) return;

        const connectResult = await this.internalSendRequestAndWait({
          startDate: startTime,
          command: 'Core.connect',
          args: [this.connectOptions],
        });
        if (connectResult?.data) {
          const { maxConcurrency } = connectResult.data;
          if (
            maxConcurrency &&
            (!this.options.maxConcurrency || maxConcurrency < this.options.maxConcurrency)
          ) {
            log.info('Overriding max concurrency with Core value', {
              maxConcurrency,
              sessionId: null,
            });
            this.coreSessions.concurrency = maxConcurrency;
            this.options.maxConcurrency = maxConcurrency;
          }
        }
        this.emit('connected');
      } catch (err) {
        this.connectPromise.resolve(err);
      } finally {
        if (!this.connectPromise.isResolved) this.connectPromise.resolve();
      }
    }

    return this.connectPromise.promise;
  }

  public async disconnect(fatalError?: Error): Promise<void> {
    // user triggered disconnect sends a disconnect to Core
    const startTime = new Date();
    await this.internalDisconnect(fatalError, async () => {
      try {
        await this.internalSendRequestAndWait(
          {
            command: 'Core.disconnect',
            startDate: startTime,
            args: [fatalError],
          },
          2e3,
        );
      } catch (error) {
        // don't do anything
      }
    });
  }

  public willDisconnect(): void {
    this.coreSessions.willStop();
    this.commandQueue.willStop();
  }
  ///////  PIPE FUNCTIONS  /////////////////////////////////////////////////////////////////////////////////////////////

  public async sendRequest(
    payload: Omit<ICoreRequestPayload, 'messageId' | 'sendDate'>,
  ): Promise<ICoreResponsePayload> {
    const result = await this.connect();
    if (result) throw result;

    return this.internalSendRequestAndWait(payload);
  }

  public onMessage(
    payload: ICoreResponsePayload | ICoreEventPayload | ICoreConnectionEventPayload,
  ): void {
    if ((payload as ICoreConnectionEventPayload).disconnecting) {
      this.willDisconnect();
    } else if ((payload as ICoreResponsePayload).responseId) {
      payload = payload as ICoreResponsePayload;
      this.onResponse(payload.responseId, payload);
    } else if ((payload as ICoreEventPayload).listenerId) {
      this.onEvent(payload as ICoreEventPayload);
    } else {
      throw new Error(`message could not be processed: ${JSON.stringify(payload)}`);
    }
  }
  ///////  SESSION FUNCTIONS  //////////////////////////////////////////////////////////////////////////////////////////

  public async createSession(
    options: Omit<ISessionCreateOptions, 'sessionId'> & Pick<IHeroCreateOptions, 'sessionId'>,
    hero: Hero,
  ): Promise<CoreSession> {
    try {
      if (options.sessionId) options.sessionId = await options.sessionId;

      let restoreMode: CoreCommandQueue['mode'];
      if (this.commandQueue.mode !== options.mode) {
        restoreMode = this.commandQueue.mode;
        this.commandQueue.mode = options.mode;
      }
      const sessionMeta = await this.commandQueue.run<ISessionMeta>('Core.createSession', options);
      if (restoreMode) {
        this.commandQueue.mode = restoreMode;
      }
      const coreSession = new CoreSession(
        { ...sessionMeta, sessionName: options.sessionName },
        this,
        hero,
        options.mode,
      );
      this.coreSessions.track(coreSession);
      return coreSession;
    } catch (error) {
      if (error instanceof DisconnectedFromCoreError && this.isDisconnecting) return null;
      throw error;
    }
  }

  public getSession(sessionId: string): CoreSession {
    return this.coreSessions.get(sessionId);
  }

  public untrackSession(coreSession: CoreSession): void {
    this.coreSessions.untrack(coreSession.sessionId);
  }

  public async logUnhandledError(error: Error): Promise<void> {
    await this.commandQueue.run('Core.logUnhandledError', error);
  }

  protected async internalDisconnect(
    fatalError?: Error,
    beforeClose?: () => Promise<any>,
  ): Promise<void> {
    if (this.isDisconnecting) return this.isDisconnecting;
    const resolvable = new Resolvable<void>();
    this.isDisconnecting = resolvable.promise;

    try {
      const logid = log.stats('ConnectionToCore.Disconnecting', {
        host: this.hostOrError,
        sessionId: null,
      });
      const hasSessions = this.coreSessions?.size > 0;
      this.cancelPendingRequests();

      if (this.connectPromise) {
        if (!this.connectPromise.isResolved) {
          const result =
            hasSessions && !this.didAutoConnect
              ? new DisconnectedFromCoreError(this.resolvedHost)
              : null;
          this.connectPromise.resolve(result);
        } else if (beforeClose) {
          await beforeClose();
        }
      }
      await this.destroyConnection();
      log.stats('ConnectionToCore.Disconnected', {
        parentLogId: logid,
        host: this.hostOrError,
        sessionId: null,
      });
      this.emit('disconnected');
    } finally {
      resolvable.resolve();
    }
  }

  protected async internalSendRequestAndWait(
    payload: Omit<ICoreRequestPayload, 'messageId' | 'sendDate'>,
    timeoutMs?: number,
  ): Promise<ICoreResponsePayload> {
    const { promise, id, resolve } = this.createPendingResult();
    const { command } = payload;

    if (command === 'Core.connect') this.connectRequestId = id;
    if (command === 'Core.disconnect') this.disconnectRequestId = id;

    let timeout: NodeJS.Timeout;
    if (timeoutMs) timeout = setTimeout(() => resolve(null), timeoutMs).unref();
    try {
      await this.internalSendRequest({
        messageId: id,
        sendDate: new Date(),
        ...payload,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof CanceledPromiseError) {
        this.pendingRequestsById.delete(id);
        return;
      }
      throw error;
    }

    // now run to completion with timeout
    try {
      return await promise;
    } finally {
      clearTimeout(timeout);
    }
  }

  protected onEvent(payload: ICoreEventPayload): void {
    const { meta, listenerId, eventArgs, lastCommandId } = payload as ICoreEventPayload;
    const session = this.getSession(meta.sessionId);
    session?.onEvent(meta, listenerId, eventArgs, lastCommandId);
  }

  protected onResponse(id: string, message: ICoreResponsePayload): void {
    const pending = this.pendingRequestsById.get(id);
    if (!pending) return;
    this.pendingRequestsById.delete(id);
    const isInternalRequest = this.connectRequestId === id || this.disconnectRequestId === id;
    if (this.disconnectRequestId === id) this.disconnectRequestId = null;
    if (this.connectRequestId === id) this.connectRequestId = null;

    if (message.data instanceof Error) {
      let responseError = message.data;
      const isDisconnected =
        this.isDisconnecting ||
        responseError.name === SessionClosedOrMissingError.name ||
        (responseError as any).isDisconnecting === true;
      delete (responseError as any).isDisconnecting;

      if (!isInternalRequest && isDisconnected) {
        responseError = new DisconnectedFromCoreError(this.resolvedHost);
      }
      this.rejectPendingRequest(pending, responseError);
    } else {
      pending.resolve({ data: message.data });
    }
  }

  protected async onConnectionTerminated(): Promise<void> {
    if (this.isConnectionTerminated) return;

    this.isConnectionTerminated = true;
    await this.internalDisconnect();
    if (this.connectRequestId) {
      this.onResponse(this.connectRequestId, {
        data: this.didAutoConnect ? new DisconnectedFromCoreError(this.resolvedHost) : null,
      });
    }
    if (this.disconnectRequestId) {
      this.onResponse(this.disconnectRequestId, {
        data: null,
      });
    }
  }

  protected cancelPendingRequests(): void {
    const host = String(this.resolvedHost);
    for (const entry of this.pendingRequestsById.values()) {
      const id = entry.id;
      if (this.connectRequestId === id || this.disconnectRequestId === id) {
        continue;
      }
      this.pendingRequestsById.delete(id);
      this.rejectPendingRequest(entry, new DisconnectedFromCoreError(host));
    }
    this.commandQueue.stop(new DisconnectedFromCoreError(host));
    this.coreSessions.stop(new DisconnectedFromCoreError(host));
  }

  private createPendingResult(): IResolvablePromiseWithId {
    const resolvablePromise = createPromise<ICoreResponsePayload>() as IResolvablePromiseWithId;
    this.lastId += 1;
    const id = this.lastId.toString();
    resolvablePromise.id = id;
    this.pendingRequestsById.set(id, resolvablePromise);
    return this.pendingRequestsById.get(id);
  }

  private rejectPendingRequest(pending: IResolvablePromiseWithId, error: Error): void {
    error.stack += `\n${'------CONNECTION'.padEnd(50, '-')}\n${pending.stack}`;
    pending.reject(error);
  }
}

interface IResolvablePromiseWithId extends IResolvablePromise<ICoreResponsePayload> {
  id: string;
}

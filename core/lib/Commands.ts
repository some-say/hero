import ICommandMeta from '@ulixee/hero-interfaces/ICommandMeta';
import TypeSerializer from '@ulixee/commons/lib/TypeSerializer';
import SessionDb from '../dbs/SessionDb';
import { IEventRecord } from '../models/AwaitedEventsTable';
import { IJsPath } from 'awaited-dom/base/AwaitedPath';
import { IRemoteEmitFn } from '../interfaces/IRemoteEventListener';
import Resolvable from '@ulixee/commons/lib/Resolvable';
import ISourceCodeLocation from '@ulixee/commons/interfaces/ISourceCodeLocation';
import { TypedEventEmitter } from '@ulixee/commons/lib/eventUtils';

export default class Commands extends TypedEventEmitter<{
  start: ICommandMeta;
  finish: ICommandMeta;
}> {
  public readonly history: ICommandMeta[] = [];
  public get last(): ICommandMeta | undefined {
    if (this.history.length === 0) return;
    return this.history[this.history.length - 1];
  }

  public get lastId(): number {
    return this.last?.id;
  }

  public get length(): number {
    return this.history.length;
  }

  public requiresScriptRestart = false;

  public nextCommandMeta: {
    commandId: number;
    startDate: Date;
    sendDate: Date;
    callsite?: ISourceCodeLocation[];
    retryNumber?: number;
    activeFlowHandlerId?: number;
    flowCommandId?: number;
  };

  private listenersById = new Map<string, IRemoteListenerDetails>();
  private listenerIdCounter = 0;
  private commandLockPromise: Resolvable<void>;

  constructor(readonly db: SessionDb) {
    super();
  }

  public waitForCommandLock(): Promise<void> {
    return this.commandLockPromise?.promise;
  }

  public pause(): void {
    if (!this.commandLockPromise || this.commandLockPromise.isResolved) {
      this.commandLockPromise = new Resolvable();
    }
  }

  public resume(): void {
    this.commandLockPromise.resolve();
    this.commandLockPromise = null;
  }

  public create(
    tabId: number,
    frameId: number,
    startNavigationId: number,
    commandName: string,
    args: any[],
  ): ICommandMeta {
    const commandMeta = {
      id: this.history.length + 1,
      tabId,
      frameId,
      name: commandName,
      retryNumber: 0,
      args: args.length ? TypeSerializer.stringify(args) : undefined,
      startNavigationId,
    } as ICommandMeta;

    if (this.nextCommandMeta) {
      const {
        commandId,
        sendDate,
        startDate,
        callsite,
        retryNumber,
        activeFlowHandlerId,
        flowCommandId,
      } = this.nextCommandMeta;
      this.nextCommandMeta = null;
      if (commandId) commandMeta.id = commandId;
      commandMeta.clientSendDate = sendDate?.getTime();
      commandMeta.clientStartDate = startDate?.getTime();
      commandMeta.callsite = callsite;
      commandMeta.retryNumber = retryNumber;
      commandMeta.activeFlowHandlerId = activeFlowHandlerId;
      commandMeta.flowCommandId = flowCommandId;
    }
    return commandMeta;
  }

  public onStart(commandMeta: ICommandMeta, startDate: number): void {
    commandMeta.runStartDate = startDate;
    this.history.push(commandMeta);
    this.history.sort((a, b) => {
      if (a.id !== b.id) return a.id - b.id;
      if (a.retryNumber !== b.retryNumber) return a.retryNumber - b.retryNumber;
    });
    this.db.commands.insert(commandMeta);
    this.emit('start', commandMeta);
  }

  public onFinished(commandMeta: ICommandMeta, result: any, endNavigationId: number): void {
    commandMeta.endDate = Date.now();
    commandMeta.result = result;
    commandMeta.endNavigationId = endNavigationId;
    this.db.commands.insert(commandMeta);
    this.emit('finish', commandMeta);
  }

  public getCommandForTimestamp(lastCommand: ICommandMeta, timestamp: number): ICommandMeta {
    let command = lastCommand;
    if (command.runStartDate <= timestamp && command.endDate > timestamp) {
      return command;
    }

    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      command = this.history[i];
      if (command.runStartDate <= timestamp) break;
    }
    return command;
  }

  public observeRemoteEvents(
    type: string,
    emitFn: IRemoteEmitFn,
    jsPath?: IJsPath,
    tabId?: number,
    frameId?: number,
  ): IRemoteListenerDetails {
    const id = String((this.listenerIdCounter += 1));
    const details: IRemoteListenerDetails = {
      id,
      listenFn: this.onRemoteEvent.bind(this, id, emitFn, tabId, frameId),
      type,
      jsPath,
    };
    this.listenersById.set(id, details);
    return details;
  }

  public getRemoteEventListener(listenerId: string): IRemoteListenerDetails {
    return this.listenersById.get(listenerId);
  }

  private onRemoteEvent(
    listenerId: string,
    listenFn: IRemoteEmitFn,
    tabId: number,
    frameId: number,
    ...eventArgs: any[]
  ): void {
    listenFn(listenerId, ...eventArgs);
    const event = <IEventRecord>{
      timestamp: Date.now(),
      publishedAtCommandId: this.lastId,
      tabId,
      frameId,
      listenerId,
      eventArgs,
    };
    this.db.awaitedEvents.insert(event);
  }
}

interface IRemoteListenerDetails {
  id: string;
  listenFn: (...eventArgs: any[]) => any;
  type: string;
  jsPath?: IJsPath;
}

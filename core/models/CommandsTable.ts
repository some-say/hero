import ICommandMeta from '@ulixee/hero-interfaces/ICommandMeta';
import { Database as SqliteDatabase } from 'better-sqlite3';
import SqliteTable from '@ulixee/commons/lib/SqliteTable';
import TypeSerializer from '@ulixee/commons/lib/TypeSerializer';

export default class CommandsTable extends SqliteTable<ICommandMeta> {
  constructor(readonly db: SqliteDatabase) {
    super(
      db,
      'Commands',
      [
        ['id', 'INTEGER', 'NOT NULL PRIMARY KEY'],
        ['retryNumber', 'INTEGER', 'NOT NULL PRIMARY KEY'],
        ['tabId', 'INTEGER'],
        ['frameId', 'INTEGER'],
        ['flowCommandId', 'INTEGER'],
        ['activeFlowHandlerId', 'INTEGER'],
        ['name', 'TEXT'],
        ['args', 'TEXT'],
        ['clientStartDate', 'INTEGER'],
        ['clientSendDate', 'INTEGER'],
        ['runStartDate', 'INTEGER'],
        ['endDate', 'INTEGER'],
        ['result', 'TEXT'],
        ['resultType', 'TEXT'],
        ['callsite', 'TEXT'],
      ],
      true,
    );
    this.defaultSortOrder = 'id ASC';
  }

  public insert(commandMeta: ICommandMeta): void {
    commandMeta.resultType = commandMeta.result?.constructor?.name ?? typeof commandMeta.result;

    this.queuePendingInsert([
      commandMeta.id,
      commandMeta.retryNumber ?? 0,
      commandMeta.tabId,
      commandMeta.frameId,
      commandMeta.flowCommandId,
      commandMeta.activeFlowHandlerId,
      commandMeta.name,
      commandMeta.args,
      commandMeta.clientStartDate,
      commandMeta.clientSendDate,
      commandMeta.runStartDate,
      commandMeta.endDate,
      TypeSerializer.stringify(commandMeta.result),
      commandMeta.resultType,
      commandMeta.callsite ? JSON.stringify(commandMeta.callsite) : undefined,
    ]);
  }
}

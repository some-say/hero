import { Database as SqliteDatabase } from 'better-sqlite3';
import SqliteTable from '@ulixee/commons/lib/SqliteTable';
import { FocusEventType, IFocusEvent } from '@ulixee/hero-interfaces/IFocusEvent';

export default class FocusEventsTable extends SqliteTable<IFocusRecord> {
  constructor(readonly db: SqliteDatabase) {
    super(db, 'FocusEvents', [
      ['tabId', 'INTEGER'],
      ['frameId', 'INTEGER'],
      ['event', 'INTEGER'],
      ['targetNodeId', 'INTEGER'],
      ['relatedTargetNodeId', 'INTEGER'],
      ['timestamp', 'DATETIME'],
    ]);
  }

  public insert(
    tabId: number,
    frameId: number,
    commandId: number,
    focusEvent: IFocusEvent,
  ): IFocusRecord {
    const [event, targetNodeId, relatedTargetNodeId, timestamp] = focusEvent;
    const record = [tabId, frameId, event, targetNodeId, relatedTargetNodeId, timestamp];
    this.queuePendingInsert(record);
    return { tabId, frameId, event, targetNodeId, relatedTargetNodeId, timestamp };
  }
}

export interface IFocusRecord {
  tabId: number;
  frameId: number;
  event: FocusEventType;
  targetNodeId?: number;
  relatedTargetNodeId?: number;
  timestamp: number;
}

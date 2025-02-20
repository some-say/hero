import IResourceMeta from '@ulixee/hero-interfaces/IResourceMeta';
import ICoreRequestPayload from '@ulixee/hero-interfaces/ICoreRequestPayload';
import Resource from '../lib/Resource';
import Hero from '../index';
import ConnectionToCore from '../connections/ConnectionToCore';

const sessionMeta = {
  tabId: 1,
  sessionId: 'session-id',
};

let testConnection: ConnectionToCore;
let spy: jest.SpyInstance;
beforeEach(() => {
  class TestConnection extends ConnectionToCore {
    async internalSendRequest({ command, messageId }: ICoreRequestPayload): Promise<void> {
      if (command === 'Core.createSession') {
        this.onMessage({ data: sessionMeta, responseId: messageId });
      } else if (command === 'Events.addEventListener') {
        this.onMessage({ data: { listenerId: 'listener-id' }, responseId: messageId });
      } else {
        this.onMessage({ data: {}, responseId: messageId });
      }
    }

    protected createConnection = () => Promise.resolve(null);
    protected destroyConnection = () => Promise.resolve(null);
  }
  testConnection = new TestConnection();
  spy = jest.spyOn<any, any>(testConnection, 'internalSendRequest');
});

describe('events', () => {
  it('receives close event', async () => {
    const hero = new Hero({ connectionToCore: testConnection });

    let isClosed = false;
    await hero.on('close', () => {
      isClosed = true;
    });

    testConnection.onMessage({
      meta: { sessionId: 'session-id' },
      listenerId: 'listener-id',
      eventArgs: [],
    });
    await hero.close();

    const outgoingCommands = spy.mock.calls;
    expect(outgoingCommands.map(c => c[0].command)).toMatchObject([
      'Core.connect',
      'Core.createSession',
      'Events.addEventListener', // user added close listener
      'Session.close',
    ]);
    expect(isClosed).toBe(true);
  });

  it('adds and removes event listeners', async () => {
    let eventCount = 0;

    const hero = new Hero({ connectionToCore: testConnection });

    const onResourceFn = (resource): void => {
      expect(resource).toBeInstanceOf(Resource);
      eventCount += 1;
    };

    await hero.activeTab.on('resource', onResourceFn);

    testConnection.onMessage({
      meta: sessionMeta,
      listenerId: 'listener-id',
      eventArgs: [
        {
          id: 1,
        } as IResourceMeta,
      ],
    });
    testConnection.onMessage({
      meta: sessionMeta,
      listenerId: 'listener-id',
      eventArgs: [
        {
          id: 2,
        } as IResourceMeta,
      ],
    });

    // need to wait since events are handled on a promise resolution
    await new Promise(setImmediate);
    expect(eventCount).toBe(2);

    await hero.activeTab.off('resource', onResourceFn);
    testConnection.onMessage({
      meta: sessionMeta,
      listenerId: 'listener-id',
      eventArgs: [
        {
          id: 3,
        } as IResourceMeta,
      ],
    });
    expect(eventCount).toBe(2);
  });
});

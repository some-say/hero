import { Helpers } from '@ulixee/hero-testing';
import { ITestKoaServer } from '@ulixee/hero-testing/helpers';
import ISessionCreateOptions from '@ulixee/hero-interfaces/ISessionCreateOptions';
import HumanEmulator from '@ulixee/hero-plugin-utils/lib/HumanEmulator';
import IUserProfile from '@ulixee/hero-interfaces/IUserProfile';
import Core, { Tab } from '../index';
import ConnectionToClient from '../connections/ConnectionToClient';
import Session from '../lib/Session';
import Interactor from '../lib/Interactor';

const playInteractionSpy = jest.spyOn(Interactor.prototype, 'play');
let koaServer: ITestKoaServer;
let connectionToClient: ConnectionToClient;
beforeAll(async () => {
  Core.use(
    class BasicHumanEmulator extends HumanEmulator {
      static id = 'basic';
    },
  );
  await Core.start();
  connectionToClient = Core.addConnection();
  await connectionToClient.connect();
  Helpers.onClose(() => connectionToClient.disconnect(), true);
  koaServer = await Helpers.runKoaServer();
});

afterAll(Helpers.afterAll);
afterEach(Helpers.afterEach);

describe('miscellaneous', () => {
  test('can pause and resume sessions', async () => {
    playInteractionSpy.mockClear();
    koaServer.get('/sessionPause1', async ctx => {
      ctx.body = `<body><h1>Done</h1></body>`;
    });
    koaServer.get('/sessionPause2', async ctx => {
      ctx.body = `<body><h1>Done</h1></body>`;
    });
    const { session, tab } = await createSession();
    await tab.goto(`${koaServer.baseUrl}/sessionPause1`);
    await session.pauseCommands();

    const pauseResponse = tab.goto(`${koaServer.baseUrl}/sessionPause2`);
    const response = await Promise.race([
      pauseResponse,
      new Promise(resolve => setTimeout(resolve, 500)),
    ]);
    expect(response).not.toBeTruthy();
    expect(tab.url).toBe(`${koaServer.baseUrl}/sessionPause1`);
    await session.resumeCommands();

    await expect(pauseResponse).resolves.toBeTruthy();
    expect(tab.url).toBe(`${koaServer.baseUrl}/sessionPause2`);
  });
});

describe('sessionResume tests when resume location is sessionStart', () => {
  test('should restart a session within a currently open browserContext', async () => {
    playInteractionSpy.mockClear();
    let counter = 1;
    koaServer.get('/sessionResumeSessionStart', ctx => {
      ctx.cookies.set(`Cookie${counter}`, 'This is a test', {
        httpOnly: true,
      });
      counter += 1;
      ctx.body = `<body><h1>title</h1></body>`;
    });
    let sessionId: string;
    let firstTabPageId: string;
    let profile: IUserProfile;

    {
      const { session, tab } = await createSession({ sessionKeepAlive: true });
      sessionId = session.id;
      firstTabPageId = tab.puppetPage.id;

      simulateScriptSendingCommandMeta(session, 1);
      await tab.goto(`${koaServer.baseUrl}/sessionResumeSessionStart`);

      simulateScriptSendingCommandMeta(session, 2);
      await tab.interact([
        { command: 'move', mousePosition: ['document', ['querySelector', 'h1']] },
      ]);

      expect(playInteractionSpy).toHaveBeenCalledTimes(1);
      profile = await session.exportUserProfile();
    }
    {
      playInteractionSpy.mockClear();
      const { session, tab } = await createSession({
        sessionKeepAlive: true,
        sessionResume: {
          sessionId,
          startLocation: 'sessionStart',
        },
      });

      expect(session.id).not.toBe(sessionId);
      expect(tab.puppetPage.id).not.toBe(firstTabPageId);

      simulateScriptSendingCommandMeta(session, 1);
      await tab.goto(`${koaServer.baseUrl}/sessionResumeSessionStart`);

      simulateScriptSendingCommandMeta(session, 2);
      await tab.interact([
        { command: 'move', mousePosition: ['document', ['querySelector', 'h1']] },
      ]);

      expect(playInteractionSpy).toHaveBeenCalledTimes(1);
      const newProfile = await session.exportUserProfile();
      expect(newProfile.userAgentString).toBe(profile.userAgentString);
      expect(newProfile.deviceProfile).toEqual(profile.deviceProfile);
      expect(newProfile.cookies).not.toEqual(profile.cookies);
      expect(newProfile.cookies.filter(x => x.name === 'Cookie1')).toHaveLength(0);
      expect(newProfile.cookies.filter(x => x.name === 'Cookie2')).toHaveLength(1);
    }
  });

  test('should restart a session with a closed session', async () => {
    playInteractionSpy.mockClear();
    let counter = 1;
    koaServer.get('/sessionResumeSessionStartClosed', ctx => {
      ctx.cookies.set(`Cookie${counter}`, 'This is a test', {
        httpOnly: true,
      });
      counter += 1;
      ctx.body = `<body><h1>title</h1></body>`;
    });
    let sessionId: string;
    let firstTabPageId: string;
    let profile: IUserProfile;

    {
      const { session, tab } = await createSession({
        sessionKeepAlive: true,
        locale: 'de',
        userProfile: {
          cookies: [
            {
              sameSite: 'None',
              name: 'CookieRestore',
              value: 'true',
              domain: 'localhost',
              path: '/',
              expires: '-1',
              httpOnly: true,
              secure: false,
            },
          ],
        },
      });
      sessionId = session.id;
      firstTabPageId = tab.puppetPage.id;

      simulateScriptSendingCommandMeta(session, 1);
      await tab.goto(`${koaServer.baseUrl}/sessionResumeSessionStartClosed`);

      simulateScriptSendingCommandMeta(session, 2);
      await tab.interact([
        { command: 'move', mousePosition: ['document', ['querySelector', 'h1']] },
      ]);

      expect(playInteractionSpy).toHaveBeenCalledTimes(1);
      profile = await session.exportUserProfile();
      expect(profile.cookies).toHaveLength(2);
      await session.close(true);
    }
    {
      playInteractionSpy.mockClear();
      const { session, tab } = await createSession({
        sessionKeepAlive: true,
        sessionResume: {
          sessionId,
          startLocation: 'sessionStart',
        },
      });

      // should be a new session this time
      expect(session.id).not.toBe(sessionId);
      expect(tab.puppetPage.id).not.toBe(firstTabPageId);

      simulateScriptSendingCommandMeta(session, 1);
      await tab.goto(`${koaServer.baseUrl}/sessionResumeSessionStartClosed`);

      simulateScriptSendingCommandMeta(session, 2);
      await tab.interact([
        { command: 'move', mousePosition: ['document', ['querySelector', 'h1']] },
      ]);

      expect(playInteractionSpy).toHaveBeenCalledTimes(1);
      expect(session.commands.history).toHaveLength(2);

      const meta = await session.getHeroMeta();
      expect(meta.locale).toBe('de');

      const newProfile = await session.exportUserProfile();
      expect(newProfile.userAgentString).toBe(profile.userAgentString);
      expect(newProfile.deviceProfile).toEqual(profile.deviceProfile);
      expect(newProfile.cookies).not.toEqual(profile.cookies);
      expect(newProfile.cookies.filter(x => x.name === 'Cookie1')).toHaveLength(0);
      expect(newProfile.cookies.filter(x => x.name === 'Cookie2')).toHaveLength(1);
      expect(newProfile.cookies.filter(x => x.name === 'CookieRestore')).toHaveLength(1);
    }
  });

  test('should throw an error if a session is not available to resume', async () => {
    await expect(
      createSession({
        sessionKeepAlive: true,
        sessionResume: {
          sessionId: 'notreal',
          startLocation: 'sessionStart',
        },
      }),
    ).rejects.toThrowError();
  });
});

function simulateScriptSendingCommandMeta(session: Session, id: number): void {
  session.commands.nextCommandMeta = {
    commandId: id,
    startDate: new Date(),
    sendDate: new Date(),
  };
}

async function createSession(
  options?: ISessionCreateOptions,
): Promise<{ session: Session; tab: Tab }> {
  const meta = await connectionToClient.createSession(options);
  const tab = Session.getTab(meta);
  Helpers.onClose(() => tab.session.close(true));
  return { session: tab.session, tab };
}

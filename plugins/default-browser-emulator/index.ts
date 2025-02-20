import BrowserEmulator from '@ulixee/hero-plugin-utils/lib/BrowserEmulator';
import IHttpResourceLoadDetails from '@ulixee/hero-interfaces/IHttpResourceLoadDetails';
import IDnsSettings from '@ulixee/hero-interfaces/IDnsSettings';
import ITcpSettings from '@ulixee/hero-interfaces/ITcpSettings';
import ITlsSettings from '@ulixee/hero-interfaces/ITlsSettings';
import { IPuppetPage } from '@ulixee/hero-interfaces/IPuppetPage';
import {
  BrowserEmulatorClassDecorator,
  IBrowserEmulatorConfig,
} from '@ulixee/hero-interfaces/ICorePlugin';
import { IPuppetWorker } from '@ulixee/hero-interfaces/IPuppetWorker';
import IViewport from '@ulixee/hero-interfaces/IViewport';
import ICorePluginCreateOptions from '@ulixee/hero-interfaces/ICorePluginCreateOptions';
import IUserAgentOption from '@ulixee/hero-interfaces/IUserAgentOption';
import BrowserEngine from '@ulixee/hero-plugin-utils/lib/BrowserEngine';
import IGeolocation from '@ulixee/hero-interfaces/IGeolocation';
import IHttp2ConnectSettings from '@ulixee/hero-interfaces/IHttp2ConnectSettings';
import IHttpSocketAgent from '@ulixee/hero-interfaces/IHttpSocketAgent';
import Viewports from './lib/Viewports';
import setWorkerDomOverrides from './lib/setWorkerDomOverrides';
import setPageDomOverrides from './lib/setPageDomOverrides';
import setUserAgent from './lib/helpers/setUserAgent';
import setScreensize from './lib/helpers/setScreensize';
import setTimezone from './lib/helpers/setTimezone';
import setLocale from './lib/helpers/setLocale';
import setActiveAndFocused from './lib/helpers/setActiveAndFocused';
import selectUserAgentOption from './lib/helpers/selectUserAgentOption';
import modifyHeaders from './lib/helpers/modifyHeaders';
import configureSessionDns from './lib/helpers/configureSessionDns';
import configureSessionTcp from './lib/helpers/configureSessionTcp';
import configureSessionTls from './lib/helpers/configureSessionTls';
import FirstPartyCookiesPlugin from './lib/plugins/FirstPartyCookiesPlugin';
import DataLoader from './lib/DataLoader';
import IBrowserData from './interfaces/IBrowserData';
import selectBrowserEngineOption from './lib/helpers/selectBrowserEngineOption';
import setGeolocation from './lib/helpers/setGeolocation';
import { configureBrowserLaunchArgs } from './lib/helpers/configureBrowserLaunchArgs';
import loadDomOverrides from './lib/loadDomOverrides';
import DomOverridesBuilder from './lib/DomOverridesBuilder';
import configureDeviceProfile from './lib/helpers/configureDeviceProfile';
import configureHttp2Session from './lib/helpers/configureHttp2Session';
import lookupPublicIp, { IpLookupServices } from './lib/helpers/lookupPublicIp';
import IUserAgentData from './interfaces/IUserAgentData';
import UserAgentOptions from './lib/UserAgentOptions';
import BrowserEngineOptions from './lib/BrowserEngineOptions';

// Configuration to rotate out the default browser id. Used for testing different browsers via cli
const defaultBrowserId = process.env.HERO_DEFAULT_BROWSER_ID;

const dataLoader = new DataLoader(__dirname);
const browserEngineOptions = new BrowserEngineOptions(dataLoader, defaultBrowserId);
const userAgentOptions = new UserAgentOptions(dataLoader, browserEngineOptions);

export const defaultBrowserEngine = browserEngineOptions.default;

@BrowserEmulatorClassDecorator
export default class DefaultBrowserEmulator extends BrowserEmulator {
  public static id = dataLoader.pkg.name.replace('@ulixee/', '');

  public timezoneId: string;
  public locale: string;
  public viewport: IViewport;
  public geolocation: IGeolocation;
  public dnsOverTlsProvider: IDnsSettings['dnsOverTlsConnection'];
  public upstreamProxyIpMask: IBrowserEmulatorConfig['upstreamProxyIpMask'];
  public upstreamProxyUrl: string;

  protected readonly data: IBrowserData;
  private readonly domOverridesBuilder: DomOverridesBuilder;
  private readonly userAgentData: IUserAgentData;

  constructor(createOptions: ICorePluginCreateOptions) {
    super(createOptions);
    this.data = dataLoader.as(createOptions.userAgentOption) as any;
    this.userAgentData = this.getUserAgentData();
    // set default device profile options
    configureDeviceProfile(this.deviceProfile);

    if (this.data.browserConfig.features.includes('FirstPartyCookies')) {
      createOptions.corePlugins.use(FirstPartyCookiesPlugin);
    }
    this.domOverridesBuilder = loadDomOverrides(this, this.data, this.userAgentData);
  }

  configure(config: IBrowserEmulatorConfig): void {
    if (!config) return;

    config.locale ??= this.locale ?? this.data.browserConfig.defaultLocale;
    config.viewport ??=
      this.viewport ?? Viewports.getDefault(this.data.windowBaseFraming, this.data.windowFraming);
    config.timezoneId ??= this.timezoneId ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    config.geolocation ??= this.geolocation;
    if (config.upstreamProxyUrl) {
      config.upstreamProxyIpMask ??= {};
      config.upstreamProxyIpMask.ipLookupService ??= IpLookupServices.ipify;
    }

    this.locale = config.locale;
    this.viewport = config.viewport;
    this.timezoneId = config.timezoneId;
    this.geolocation = config.geolocation;
    this.dnsOverTlsProvider = config.dnsOverTlsProvider;
    this.upstreamProxyIpMask = config.upstreamProxyIpMask;
    this.upstreamProxyUrl = config.upstreamProxyUrl;
  }

  public onDnsConfiguration(settings: IDnsSettings): void {
    configureSessionDns(this, settings);

    if (this.dnsOverTlsProvider !== undefined) {
      settings.dnsOverTlsConnection = this.dnsOverTlsProvider;
    }
  }

  public onTcpConfiguration(settings: ITcpSettings): void {
    configureSessionTcp(this, settings);
  }

  public onTlsConfiguration(settings: ITlsSettings): void {
    configureSessionTls(this, settings);
  }

  public beforeHttpRequest(resource: IHttpResourceLoadDetails): void {
    modifyHeaders(this, this.data, this.userAgentData, resource);
  }

  public async onHttpAgentInitialized(agent: IHttpSocketAgent): Promise<void> {
    if (this.upstreamProxyIpMask) {
      this.upstreamProxyIpMask.publicIp ??= await lookupPublicIp(
        this.upstreamProxyIpMask.ipLookupService,
      );
      this.upstreamProxyIpMask.proxyIp ??= await lookupPublicIp(
        this.upstreamProxyIpMask.ipLookupService,
        agent,
        this.upstreamProxyUrl,
      );
      this.logger.info('PublicIp Lookup', {
        ...this.upstreamProxyIpMask,
      });
      this.domOverridesBuilder.add('webrtc', {
        localIp: this.upstreamProxyIpMask.publicIp,
        proxyIp: this.upstreamProxyIpMask.proxyIp,
      });
    }
  }

  public onHttp2SessionConnect(
    request: IHttpResourceLoadDetails,
    settings: IHttp2ConnectSettings,
  ): void {
    configureHttp2Session(this, this.data, request, settings);
  }

  public onNewPuppetPage(page: IPuppetPage): Promise<any> {
    // Don't await here! we want to queue all these up to run before the debugger resumes
    const devtools = page.devtoolsSession;
    return Promise.all([
      setUserAgent(this, devtools, this.userAgentData),
      setTimezone(this, devtools),
      setLocale(this, devtools),
      setScreensize(this, page, devtools),
      setActiveAndFocused(this, devtools),
      setPageDomOverrides(this.domOverridesBuilder, this.data, page),
      setGeolocation(this, page),
    ]);
  }

  public onNewPuppetWorker(worker: IPuppetWorker): Promise<any> {
    const devtools = worker.devtoolsSession;
    return Promise.all([
      setUserAgent(this, devtools, this.userAgentData),
      setWorkerDomOverrides(this.domOverridesBuilder, this.data, worker),
    ]);
  }

  protected getUserAgentData(): IUserAgentData {
    if (!this.data.windowNavigator.navigator.userAgentData) return null;
    const uaFullVersion = `${this.browserVersion.major}.0.${this.browserVersion.patch}.${this.browserVersion.build}`;
    const platformVersion = `${this.operatingSystemVersion.major}.${
      this.operatingSystemVersion.minor ?? '0'
    }.${this.operatingSystemVersion.build ?? '1'}`;

    const brands = this.data.windowNavigator.navigator.userAgentData.brands;
    const brandData = [brands['0'], brands['1'], brands['2']].map(x => ({
      brand: x.brand._$value,
      version: x.version._$value,
    }));
    return {
      uaFullVersion,
      brands: brandData,
      platform: this.data.windowNavigator.navigator.userAgentData.platform._$value,
      platformVersion,
    };
  }

  public static selectBrowserMeta(userAgentSelector?: string): {
    browserEngine: BrowserEngine;
    userAgentOption: IUserAgentOption;
  } {
    const userAgentOption = selectUserAgentOption(userAgentSelector, userAgentOptions);

    const { browserName, browserVersion } = userAgentOption;
    const browserEngineId = `${browserName}-${browserVersion.major}-${browserVersion.minor}`;
    const browserEngineOption = selectBrowserEngineOption(
      browserEngineId,
      dataLoader.browserEngineOptions,
    );

    const browserEngine = new BrowserEngine(this, browserEngineOption);

    if (browserEngine.name === 'chrome') {
      const version = browserEngine.fullVersion.split('.').map(Number);
      // changes at version 90
      browserEngine.doesBrowserAnimateScrolling = version[0] >= 91;
    }
    return { browserEngine, userAgentOption };
  }

  public static onBrowserWillLaunch(
    browserEngine: BrowserEngine,
    options: {
      showBrowser?: boolean;
      disableGpu?: boolean;
      disableDevtools?: boolean;
    },
  ): void {
    configureBrowserLaunchArgs(browserEngine, options);
  }
}

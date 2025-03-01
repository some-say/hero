import ICoreConfigureOptions from '@ulixee/hero-interfaces/ICoreConfigureOptions';

export default interface IConnectionToCoreOptions
  extends Omit<ICoreConfigureOptions, 'maxConcurrentClientCount'> {
  host?: string | Promise<string>;
  maxConcurrency?: number;
  instanceTimeoutMillis?: number;
  isPersistent?: boolean; // variable to tell server to keep around connection. Defaults to true
}

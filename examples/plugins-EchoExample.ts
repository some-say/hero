import Hero, { Core } from '@ulixee/hero-fullstack';
import * as Path from 'path';

async function run() {
  // For security, need to explicitly activate dynamic loading to allow Core to load a random path.
  Core.allowDynamicPluginLoading = true;
  const hero = new Hero();
  hero.use(Path.join(__dirname, 'plugins-EchoClasses.js'));
  /**
   * Or install into Core and client
   * Core.use(require('./plugin-echo-classes'));
   * hero.use(require('./plugin-echo-classes'));
   **/

  await hero.goto('https://example.org/');
  await hero.waitForPaintingStable();
  const result = await hero.echo('Echo', 1, 2, 3, true);
  console.log('Echo result', {
    sent: ['Echo', 1, 2, 3, true],
    result,
  });
  await hero.close();
}

run().catch(error => console.log(error));

const Hero = require('@ulixee/hero-fullstack');

//process.env.HERO_SHOW_BROWSER = 'true';

(async () => {
  const url = `https://dataliberationfoundation.org/`;
  console.log('Opened Browser');
  const hero = new Hero({ showBrowserInteractions: true, showBrowser: true });

  await hero.goto(url, 5e3);
  await hero.waitForPaintingStable();

  await hero.waitForMillis(5e3);
  await hero.close();
})();

# Remote

Hero operates out of the box over WebSockets. You'll eventually want to launch Core on a server where clients can remotely access it.

You'll need a simple script to start the server on the machine where the `@ulixee/hero-core` npm package is installed. Make sure to open the port you allocate on any firewall that a client might have to pass through:

## Setting Up a Server Process

A server is provided out of the box in the `@ulixee/server` package. See details of the Ulixee Server [here](/docs/server).

```javascript
// SERVER ip is 122.22.232.1
const Server = require('@ulixee/server');

(async () => {
  const server = new Server();
  await server.listen({ port: 7007 });
})();
```

## Setting Up the Client

Your [Hero](/docs/hero/basic-interfaces/hero) instance must be configured to point at this Remote Core (and any others you've set up).

NOTE: you can use the `@ulixee/hero` npm package if you don't want to install a full browser engine on the machine coordinating all your scrapes. That example is shown below.

```javascript
const Hero = require('@ulixee/hero');

(async () => {
  const hero = new Hero({
    connectionToCore: {
      host: 'ws://localhost:7007',
    },
  });

  await hero.goto('https://ulixee.org');
})().catch(console.log);
```

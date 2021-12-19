# Tab

A Tab is similar to a tab in a consumer browser. Each Tab drives an underlying document with its own page lifecycle and resources. Many of the tab functions are available from the Hero object.

## Constructor

A default tab is provided in each Hero instance. Navigate by using the [hero.goto](/docs/basic-interfaces/hero#goto) method.

When a new window is "popped up" (ie, `<a href="/new-place" target="_blank"`), a tab will automatically be associated with the Hero instance. These can be discovered using the [hero.tabs](/docs/basic-interfaces/hero#tabs) method, or waiting with [hero.waitForNewTab()](/docs/basic-interfaces/hero#wait-for-new-tab).

## Properties

### tab.cookieStorage {#cookie-storage}

Returns a [CookieStorage](/docs/advanced/cookie-storage) instance to get/set/delete cookies in the [mainFrameEnvironment](#main-frame-environment) of this tab.

Alias for [tab.mainFrameEnvironment.cookieStorage](/docs/basic-interfaces/frame-environment#cookie-storage).

#### **Type**: [`CookieStorage`](/docs/advanced/cookie-storage)

### tab.document <div class="specs"><i>W3C</i></div> {#document}

Returns a reference to the document of the [mainFrameEnvironment](#main-frame-environment) of this tab.

Alias for [tab.mainFrameEnvironment.document](/docs/basic-interfaces/frame-environment#document).

#### **Type**: [`SuperDocument`](/docs/awaited-dom/super-document)

### tab.frameEnvironments {#frame-environments}

Returns a list of [Frames](/docs/basic-interfaces/frame-environment) loaded for this tab.

#### **Type**: [`Promise<Frame[]>`](/docs/basic-interfaces/frame-environment).

### tab.isAllContentLoaded {#is-all-content-loaded}

`True` if the "load" event has triggered in the mainFrameEnvironment.

NOTE: this event does not fire in some circumstances (such as a long-loading asset). You frequently just want to know if the page has loaded for a user (see [isPaintingStable](#is-painting-stable)). 

Wait for this event to trigger with [waitForLoad(AllContentLoaded)](#wait-for-load).

#### **Type**: `Promise<boolean>`

Alias for [tab.mainFrameEnvironment.isAllContentLoaded](/docs/basic-interfaces/frame-environment#is-all-content-loaded)

### tab.isDomContentLoaded {#is-dom-content-loaded}

`True` if the "DOMContentLoaded" event has triggered in the mainFrameEnvironment.

Wait for this event to trigger with [waitForLoad(DomContentLoaded)](#wait-for-load)

#### **Type**: `Promise<boolean>`

Alias for [tab.mainFrameEnvironment.isDomContentLoaded](/docs/basic-interfaces/frame-environment#is-dom-content-loaded)

### tab.isPaintingStable {#is-painting-stable}

`True` if the page has loaded the main content in the mainFrameEnvironment above the fold. Works on javascript-rendered pages. 

Wait for this event to trigger with [waitForPaintingStable()](#wait-for-painting-stable)

#### **Type**: `Promise<boolean>`

Alias for [tab.mainFrameEnvironment.isPaintingStable](/docs/basic-interfaces/frame-environment#is-painting-stable)

### tab.lastCommandId {#lastCommandId}

An execution point that refers to a command run on this Hero instance (`waitForElement`, `click`, `type`, etc). Command ids can be passed to select `waitFor*` functions to indicate a starting point to listen for changes.

#### **Type**: `Promise<number>`

### tab.localStorage <div class="specs"><i>W3C</i></div> {#local-storage}

Returns a reference to the [Storage](/docs/awaited-dom/storage) object managing localStorage for the [mainFrameEnvironment](#main-frame-environment) of this tab.

Alias for [tab.mainFrameEnvironment.localStorage](/docs/basic-interfaces/frame-environment#local-storage).

#### **Type**: [`Storage`](/docs/awaited-dom/storage)

### tab.mainFrameEnvironment {#main-frame-environment}

Returns the [`FrameEnvironment`](/docs/basic-interfaces/frame-environment) representing the primary content of the loaded tab.

#### **Type**: [`FrameEnvironment`](/docs/basic-interfaces/frame-environment).

### tab.sessionStorage <div class="specs"><i>W3C</i></div> {#session-storage}

Returns a reference to the [Storage](/docs/awaited-dom/storage) object managing sessionStorage for the [mainFrameEnvironment](#main-frame-environment) of this tab.

Alias for [tab.mainFrameEnvironment.sessionStorage](/docs/basic-interfaces/frame-environment#session-storage).

#### **Type**: [`Storage`](/docs/awaited-dom/storage)

### tab.tabId {#tabid}

An identifier for the tab.

#### **Type**: `Promise<number>`

### tab.url {#url}

The url of the active tab.

#### **Type**: `Promise<string>`

### tab.Request <div class="specs"><i>W3C</i></div> {#request-type}

Returns a constructor for a [Request](/docs/awaited-dom/request) object in the [mainFrameEnvironment](#main-frame-environment).

Alias for [tab.mainFrameEnvironment.Request](/docs/basic-interfaces/frame-environment#request-type)

#### **Type**: [`Request`](/docs/awaited-dom/request)

## Methods

### tab.close*()* {#close}

Closes the current tab only (will close the whole Hero instance if there are no open tabs).

#### **Returns**: `Promise`

### tab.fetch*(requestInput, requestInit)* <div class="specs"><i>W3C</i></div> {#fetch}

Perform a native "fetch" request in the [mainFrameEnvironment](#main-frame-environment) context.

NOTE: You can work around Cross Origin Request (CORS) issues or change your request "origin" by running fetch
from a different [FrameEnvironment](/docs/basic-interfaces/frame-environment#fetch).

#### **Arguments**:

- requestInput `IRequestInput` A [Request](#request-type) object or url.
- requestInit `IRequestInit?` Optional request initialization parameters. Follows w3c specification.
  - Inbound Body currently supports: `string`, `ArrayBuffer`, `null`.
  - Not supported: `Blob`, `FormData`, `ReadableStream`, `URLSearchParams`

Alias for [tab.mainFrameEnvironment.fetch](/docs/basic-interfaces/frame-environment#fetch)

#### **Returns**: [`Promise<Response>`](/docs/awaited-dom/response)

```js
const origin = 'https://dataliberationfoundation.org/';
const getUrl = 'https://dataliberationfoundation.org/mission';

await hero.goto(origin);
const response = await hero.fetch(getUrl);
```

Http Post example with a body:

```js
const origin = 'https://dataliberationfoundation.org/';
const postUrl = 'https://dataliberationfoundation.org/nopost';

await hero.goto(origin);
const response = await hero.fetch(postUrl, {
  method: 'post',
  headers: {
    Authorization: 'Basic ZWx1c3VhcmlvOnlsYWNsYXZl',
  },
  body: JSON.stringify({
    ...params,
  }),
});
```

### tab.getFrameEnvironment*(frameElement)* {#get-frame-environment}

Get the [FrameEnvironment](/docs/basic-interfaces/frame-environment) object corresponding to the provided HTMLFrameElement or HTMLIFrameElement. Use this function to interface with the full environment of the given DOM element without cross-domain restrictions.

Alias for [FrameEnvironment.getFrameEnvironment](/docs/basic-interfaces/frame-environment#get-frame-environment)

### tab.focus*()* {#focus}

Make this tab the `activeTab` within a browser, which directs many Hero methods to this tab.

#### **Returns**: `Promise`

### tab.getComputedStyle*(element, pseudoElement)* <div class="specs"><i>W3C</i></div> {#computed-style}

Perform a native `Window.getComputedStyle` request in the current main [FrameEnvironment](/docs/basic-interfaces/frame-environment) - it returns an object containing the values of all CSS properties of an element, after applying active stylesheets and resolving any basic computation those values may contain. Individual CSS property values are accessed through APIs provided by the object, or by indexing with CSS property names.

Alias for [tab.mainFrameEnvironment.getComputedStyle](/docs/basic-interfaces/frame-environment#computed-style).

#### **Arguments**:

- element [`SuperElement`](/docs/awaited-dom/super-element) An element loaded in this tab environment.
- pseudoElement `string?` Optional string specifying the pseudo-element to match (eg, ::before, ::after, etc). More information can be found on [w3c](https://www.w3.org/TR/css-pseudo-4/).

#### **Returns**: [`Promise<CssStyleDeclaration>`](/docs/awaited-dom/cssstyledeclaration)

```js
await hero.goto('https://dataliberationfoundation.org');
const { document, getComputedStyle } = hero.activeTab;
const selector = document.querySelector('h1');
const style = await getComputedStyle(selector);
const opacity = await style.getProperty('opacity');
```

### tab.getJsValue*(path)* {#get-js-value}

Extract any publicly accessible javascript value from the current main [FrameEnvironment](/docs/basic-interfaces/frame-environment) context.

NOTE: This type of operation could potentially be snooped on by the hosting website as it must run in the main Javascript environment
in order to access variables.

Alias for [tab.mainFrameEnvironment.getJsValue](/docs/basic-interfaces/frame-environment#get-js-value).

#### **Arguments**:

- path `string`

#### **Returns**: `Promise<SerializedValue>`

```js
await hero.goto('https://dataliberationfoundation.org');
const navigatorAgent = await hero.activeTab.getJsValue(`navigator.userAgent`);
```

### tab.goBack*(timeoutMs)* {#back}

Navigates to a previous url in the navigation history.

#### **Arguments**:

- timeoutMs `number`. Optional timeout milliseconds. Default `30,000`. A value of `0` will never timeout.

#### **Returns**: `Promise<string>` The new document url.

### tab.goForward*(timeoutMs)* {#forward}

Navigates forward in the navigation history stack.

#### **Arguments**:

- timeoutMs `number`. Optional timeout milliseconds. Default `30,000`. A value of `0` will never timeout.

#### **Returns**: `Promise<string>` The new document url.

### tab.goto*(locationHref, timeoutMs?)* {#goto}

Executes a navigation request for the document associated with the parent Hero instance.

#### **Arguments**:

- locationHref `string` The location to navigate to.
- timeoutMs `number`. Optional timeout milliseconds. Default `30,000`. A value of `0` will never timeout.

#### **Returns**: [`Promise<Resource>`](/docs/advanced/resource) The loaded resource representing this page.

### tab.getComputedVisibility*(node)* {#get-computed-visibility}

Determines if a node from the [mainFrameEnvironment](#main-frame-environment) is visible to an end user. This method checks whether a node (or containing element) has:

- layout: width, height, x and y.
- opacity: non-zero opacity.
- css visibility: the element does not have a computed style where visibility=hidden.
- no overlay: no other element which overlays more than one fourth of this element and has at least 1 pixel over the center of the element.
- on the visible screen (not beyond the horizontal or vertical viewport)

Alias for [tab.mainFrameEnvironment.getComputedVisibility](/docs/basic-interfaces/frame-environment#get-computed-visibility).

#### **Arguments**:

- node [`SuperNode`](/docs/awaited-dom/super-node). The node to determine visibility.

#### **Returns**: `Promise<INodeVisibility>` Boolean values indicating if the node (or closest element) is visible to an end user.

- INodeVisibility `object`
  - isVisible `boolean`. Is the node ultimately visible.
  - isFound `boolean`. Was the node found in the DOM.
  - isOnscreenVertical `boolean`. The node is on-screen vertically.
  - isOnscreenHorizontal `boolean`. The node is on-screen horizontally.
  - hasContainingElement `boolean`. The node is an Element or has a containing Element providing layout.
  - isConnected `boolean`. The node is connected to the DOM.
  - hasCssOpacity `boolean`. The display `opacity` property is not "0".
  - hasCssDisplay `boolean`. The display `display` property is not "none".
  - hasCssVisibility `boolean`. The visibility `style` property is not "hidden".
  - hasDimensions `boolean`. The node has width and height.
  - isUnobstructedByOtherElements `boolean`. The node is not hidden or obscured > 50% by another element.
  
### tab.magicSelector*(stringOrOptions)* {#magic-selector}

The magic selector is a drop-in replacement for document.querySelector, but it allows a pattern to be provided which can verify your selected elements match multiple queries.

#### **Arguments**:
- stringOrOptions `string` or `object`. Optional. When not provided and using Superhero, the MagicSelector designer is activated.
  - `string`. When a string, it will match the given selector string
  - `object`. When an object, the following properties are options:
    - minMatchingSelectors `number`. The minimum number of selectors in the provided list that must match.
    - querySelectors `string[]`. The list of query selectors to match from.

#### **Returns**: [`SuperNode`](/docs/awaited-dom/super-node). A Node that satisfies the given patterns. Evaluates to null if awaited and not present.


### tab.magicSelectorAll*(stringOrOptions)* {#magic-selector-all}

The magicSelectorAll function is a drop-in replacement for document.querySelectorAll, but it allows a pattern to be provided which can verify your selected elements match multiple queries. For this function, the full returned list of matching nodes must be the same for it to be considered a "match".

#### **Arguments**:
- stringOrOptions `string` or `object`. Optional. When not provided and using Superhero, the MagicSelector designer is activated.
  - `string`. When a string, it will match the given selector string
  - `object`. When an object, the following properties are options:
    - minMatchingSelectors `number`. The minimum number of selectors in the provided list that must match.
    - querySelectors `string[]`. The list of query selectors to match from.

#### **Returns**: [`SuperNodeList`](/docs/awaited-dom/super-node-list). A NodeList that satisfies the given patterns. Returns an empty list if a resultset is not found that satisfies the constraints.

### tab.reload*(timeoutMs?)* {#reload}

Reload the currently loaded url.

#### **Arguments**:

- timeoutMs `number`. Optional timeout milliseconds. Default `30,000`. A value of `0` will never timeout.

#### **Returns**: [`Promise<Resource>`](/docs/advanced/resource) The loaded resource representing this page.

### tab.takeScreenshot*(options?)* {#take-screenshot}

Takes a screenshot of the current contents rendered in the browser.

#### **Arguments**:

- options `object` Optional
  - format `jpeg | png`. Image format type to create. Default `jpeg`.
  - jpegQuality `number`. Optional compression quality from 1 to 100 for jpeg images (100 is highest quality).
  - rectangle `IRect`. Optionally clip the screenshot to the given rectangle (eg, x, y, width, height). Includes a pixel scale.

#### **Returns**: `Promise<Buffer>` Buffer with image bytes in base64.

### tab.waitForElement*(element,options)* {#wait-for-element}

Wait until a specific element is present in the dom of the [mainFrameEnvironment](#main-frame-environment).

Alias for [tab.mainFrameEnvironment.waitForElement](/docs/basic-interfaces/frame-environment#wait-for-element).

#### **Arguments**:

- element [`SuperElement`](/docs/awaited-dom/super-element)
- options `object` Accepts any of the following:
  - timeoutMs `number`. Timeout in milliseconds. Default `30,000`.
  - waitForVisible `boolean`. Wait until this element is visible to a user (see [getComputedVisibility](#get-computed-visibility).

#### **Returns**: `Promise`

### tab.waitForPaintingStable*(options)* {#wait-for-painting-stable}

Wait for the [mainFrameEnvironment](#main-frame-environment) to be loaded such that a user can see the main content above the fold, including on javascript-rendered pages (eg, Single Page Apps). This load event works around deficiencies in using the Document "load" event, which does not always trigger, and doesn't work for Single Page Apps.

Alias for [tab.mainFrameEnvironment.waitForPaintingStable](/docs/basic-interfaces/frame-environment#wait-for-painting-stable).

#### **Arguments**:

- options `object` Optional
  - timeoutMs `number`. Timeout in milliseconds. Default `30,000`.
  - sinceCommandId `number`. A `commandId` from which to look for load status changes.

#### **Returns**: `Promise<void>`

If at the moment of calling this method, the selector already exists, the method will return immediately.

```js
const { activeTab, document } = hero;

const elem = document.querySelector('a.visible');
await activeTab.waitForElement(elem, {
  waitForVisible: true,
});
```

### tab.waitForPageState*(states, options)* {#wait-for-page-state}

Wait for one of many possible states to be loaded. This feature allows you to detect which page has been loaded based on a series of states, each containing one or more assertions that test for a particular page or template.

#### Why? 
A common scraping challenge is to identify "which" page has loaded - which template? Is it a captcha? Is it the desired url? Am I redirecting through ad networks? 

Hero normally operates by running each command in order. This makes it a challenge to check for many possible states concurrently. `waitForPageState` runs the underlying commands for all state assertions in one round-trip to Chrome. This client-side can then synchronously evaluate a series of assertions to determine the currently loaded `Page State`.

Each Page State receives `assertion` functions (`assert` and `assertAny`) as parameters. The `assert` function can be run one or more times - if all assertions return true, the given state will be resolved as the active `Page State`. 

The `assert(statePromise, assertionCallbackFn)` function takes in a state "Promise" and will call the provided "assertion" callback function each time new state is available. Each assertionCallbackFn simply returns true/false if it's given a valid state. 

NOTE: Null access exceptions are ignored, so you don't need to worry about individual assertion data being present in the assertion callbacks.

```
 const state = await hero.waitForPageState({
  ulixee({ assert }) {
    assert(hero.url, url => url === 'https://ulixee.org'); // once the url is resolved, it will be checked against https://ulixee.org
    assert(hero.isPaintingStable); // the default function evaluates if the result is true
  },
  dlf({ assert }) {
    assert(hero.url, 'https://dataliberationfoundation.org'); // a value will be tested for equality
    assert(hero.isPaintingStable);
    assert(hero.document.querySelector('h1').textContent, text => text === "It's Time to Open the Data Economy");
  }
 });
``` 

#### Advanced:
 
The provided `assertAny` function passed into each assertion has a function that will allow you to match on some portion of assertions `assertAny(minimumValid: number, assertions: assert()[])`.

This can be useful if you know of a few cases that might be true, but some cases are flaky. For instance, if a loading indicator might be present, or a modal window, and you'd like to treat those as one state.

```
 const state = await hero.waitForPageState({
  ulixee({ assert, assertAny }) {
    assertAny(2, [
       assert(hero.document.querySelectorAll('[placeholder="Search datasets..."]').length, x => x === 3),
       assert(hero.document.querySelectorAll('.terms > li').length, x => x > 4),
       assert(hero.url, 'https://ulixee.org'),
    ]);
  },
  dlf({ assert }) {
    ...
  }
 });
``` 

#### **Arguments**:

- states `object { [StateName: string]: (function(assertions) => void) }`
  - [StateName] `string`. The key of the object is the name of the state to wait for.
  - `function((assertions: IPageStateAssert)): void`. A synchronous function that will be true if all assertions evaluate to true. 
    - assertions `object`. An object will be passed to each function with the following properties:
        - assert `function(statePromise: Promise<T>, assertionValueOrCallbackFn: (result: T) => boolean): void`. A function that takes a Promise as a first parameter, and a callback that will be checked when new state is available. 
            - statePromise `Promise<T>` A Hero Promise that issues a command against this tab (url, isPaintingStable, domElement, isVisible, etc).
            - assertionValueOrCallbackFn `value: T | function(state: T): boolean`. A function that will receive updated state as it becomes available. You should synchronously evaluate to true/false. If this parameter is a non-function, it will be compared for equality.
        - assertAny `function(minimumValidAssertions: number, assertions: assert()[]`. A function that can be used to match `minimumValidAssertions` of `assertions.length`. Assertions are functions as described above (`assert(statePromise, assertionValueOrCallbackFn)`)
- options `object` Optional
  - timeoutMs `number`. Timeout in milliseconds. Default `30,000`.

#### **Returns**: `Promise<StateName>`


### tab.waitForFileChooser*(options)* {#wait-for-file-chooser}

Wait for a `file chooser` dialog to be prompted on the page. This is usually triggered by clicking on an `input` element with `type=file`.

#### **Arguments**:

- options `object` Optional
  - timeoutMs `number`. Timeout in milliseconds. Default `30,000`.
  - sinceCommandId `number`. A `commandId` from which to look for load status changes. Default is to look back to the command preceding this command (eg, a click or interact event).

#### **Returns**: [`Promise<FileChooser>`](/docs/advanced/file-chooser)

### tab.waitForLoad*(status, options)* {#wait-for-load}

Wait for the load status of the [mainFrameEnvironment](#main-frame-environment).

Alias for [tab.mainFrameEnvironment.waitForLoad](/docs/basic-interfaces/frame-environment#wait-for-load).

#### **Arguments**:

- status `NavigationRequested | HttpRequested | HttpResponsed | HttpRedirected | DomContentLoaded | PaintingStable` The load status event to wait for.
- options `object`
  - timeoutMs `number`. Timeout in milliseconds. Default `30,000`.
  - sinceCommandId `number`. A `commandId` from which to look for status changed.

#### **Returns**: `Promise<void>`

The following are possible statuses and their meanings:

<div class="show-table-header show-bottom-border minimal-row-height"></div>

| Status                | Description                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `NavigationRequested` | A navigation request is initiated by the page or user                                    |
| `HttpRequested`       | The http request for the document has been initiated                                     |
| `HttpResponded`       | The http response has been retrieved                                                     |
| `HttpRedirected`      | The original http request was redirected                                                 |
| `DomContentLoaded`    | The dom content has been received and loaded into the document                           |
| `AllContentLoaded`    | The page load event has triggered. NOTE: this does not ALWAYS trigger in browser.        |
| `PaintingStable`      | The page has loaded the main content above the fold. Works on javascript-rendered pages. |

### tab.waitForLocation*(trigger, options)* {#wait-for-location}

Waits for a navigational change to document.location either because of a `reload` event or changes to the URL.

Alias for [tab.mainFrameEnvironment.waitForLocation](/docs/basic-interfaces/frame-environment#wait-for-location).

#### **Arguments**:

- trigger `change | reload` The same url has been reloaded, or it's a new url.
- options `object`
  - timeoutMs `number`. Timeout in milliseconds. Default `30,000`.
  - sinceCommandId `number`. A `commandId` from which to look for changes.

#### **Returns**: [`Promise<Resource>`](/docs/advanced/resource) The resource representing this location change or reload.

Location changes are triggered in one of two ways:

<div class="show-table-header show-bottom-border minimal-row-height"></div>

| Trigger  | Description                                                    |
| -------- | -------------------------------------------------------------- |
| `change` | A navigational change to document.location has been triggered. |
| `reload` | A reload of the current document.location has been triggered.  |

The following example waits for a new page to load after clicking on an anchor tag:

```js
const { user, activeTab, document } = hero;
await activeTab.goto('http://example.com');

await user.click(document.querySelector('a'));
await activeTab.waitForLocation('change');

const newUrl = await activeTab.url;
```

### tab.waitForResource*(filter, options)* {#wait-for-resource}

Wait until a specific image, stylesheet, script, websocket or other resource URL has been received.

#### **Arguments**:

- filter `object` Accepts any of the following:
  - url `string | RegExp` A string or regex to match a url on
  - type [`ResourceType`](/docs/advanced/resource#type) A resource type to filter on
  - filterFn `function(resource: Resource, done: Callback): boolean` A function to allow further filtering of returned resources. Return true to include resources, false to exclude. Calling `done` finishes execution.
- options `object` Accepts any of the following:
  - timeoutMs `number`. Timeout in milliseconds. Default `60,000`.
  - sinceCommandId `number`. A `commandId` from which to look for resources.
  - throwIfTimeout `boolean`. Throw an exception if a timeout occurs. Default `true`.

#### **Returns**: [`Promise<Resource[]>`](/docs/advanced/resource)

```js
const { user, activeTab, document } = hero;

await activeTab.goto('http://example.com');

const elem = document.querySelector('a');
await hero.click(elem);

// get all Fetches that have occurred on the page thus far.
const allFetchResources = await activeTab.waitForResource({
  type: 'Fetch',
});

const lastCommandId = activeTab.lastCommandId;

const button = document.querySelector('#submit');
await hero.click(button);

const xhrsAfterSubmit = await activeTab.waitForResource(
  {
    type: 'Xhr',
  },
  {
    sinceCommandId: lastCommandId,
  },
);
```

### tab.waitForMillis*(millis)* {#wait-for-millis}

Waits for the specified number of milliseconds.

#### **Arguments**:

- millis `number`

#### **Returns**: `Promise`

### tab.waitForMillis*(millis)* {#wait-for-millis}

Waits for the specified number of milliseconds.

#### **Arguments**:

- millis `number`

#### **Returns**: `Promise`

## Events

Hero's [EventTarget](/docs/basic-interfaces/event-target) interface deviates from the official W3C implementation in that it adds several additional method aliases such as `on` and `off`. [Learn more](/docs/basic-interfaces/event-target).

### 'dialog' {#dialog}

Emitted when a dialog is prompted on the screen

#### **Arguments in callback**:

- [`Dialog`](/docs/advanced/dialog)

### 'resource' {#resource-event}

Emitted for each resource request received by the webpage.

#### **Arguments in callback**:

- [`Resource`](/docs/advanced/resource) | [`WebsocketResource`](/docs/advanced/websocket-resource)

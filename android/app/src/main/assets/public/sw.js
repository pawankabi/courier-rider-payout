/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-b38717c4'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "244e3e0340aec312855153ab7c5bb6c3"
  }, {
    "url": "pwa-512x512.png",
    "revision": "17d98417c7c1344bb7d405ff5dc3d3a4"
  }, {
    "url": "pwa-192x192.png",
    "revision": "aa07c895c7e9965a366d532e2da256ca"
  }, {
    "url": "index.html",
    "revision": "e2056313ca08e2020f289906fd215d69"
  }, {
    "url": "icon.svg",
    "revision": "86fdebc55d4f142947971951437ca70d"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "b3ea2e34925e1c8c3e73a10afc6acdaa"
  }, {
    "url": "assets/web-CFNmnGxQ.js",
    "revision": null
  }, {
    "url": "assets/web-C0GGqwoE.js",
    "revision": null
  }, {
    "url": "assets/purify.es-DedTAGkB.js",
    "revision": null
  }, {
    "url": "assets/native-B49LJJsU.js",
    "revision": null
  }, {
    "url": "assets/index.es-B_FWTkw_.js",
    "revision": null
  }, {
    "url": "assets/index-bm0IHHq4.css",
    "revision": null
  }, {
    "url": "assets/index-CGDhtRCJ.js",
    "revision": null
  }, {
    "url": "assets/html2canvas.esm-QH1iLAAe.js",
    "revision": null
  }, {
    "url": "assets/base-B1RINjpU.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "b3ea2e34925e1c8c3e73a10afc6acdaa"
  }, {
    "url": "icon.svg",
    "revision": "86fdebc55d4f142947971951437ca70d"
  }, {
    "url": "pwa-192x192.png",
    "revision": "aa07c895c7e9965a366d532e2da256ca"
  }, {
    "url": "pwa-512x512.png",
    "revision": "17d98417c7c1344bb7d405ff5dc3d3a4"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "244e3e0340aec312855153ab7c5bb6c3"
  }, {
    "url": "manifest.webmanifest",
    "revision": "bfc30088f81becccd0828bf63751cef2"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/__.*$/]
  }));
  workbox.registerRoute(({
    request
  }) => request.mode === "navigate", new workbox.StaleWhileRevalidate({
    "cacheName": "pwa-app-shell",
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(({
    request
  }) => request.destination === "script" || request.destination === "style" || request.destination === "worker", new workbox.CacheFirst({
    "cacheName": "pwa-static-assets",
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    }), new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 2592000
    })]
  }), 'GET');
  workbox.registerRoute(({
    request
  }) => request.destination === "image", new workbox.CacheFirst({
    "cacheName": "pwa-static-images",
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    }), new workbox.ExpirationPlugin({
      maxEntries: 50,
      maxAgeSeconds: 2592000
    })]
  }), 'GET');
  workbox.registerRoute(({
    request
  }) => request.destination === "font", new workbox.CacheFirst({
    "cacheName": "pwa-fonts",
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    }), new workbox.ExpirationPlugin({
      maxEntries: 20,
      maxAgeSeconds: 31536000
    })]
  }), 'GET');

}));

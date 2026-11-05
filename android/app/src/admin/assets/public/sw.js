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
define(['./workbox-0f6cd090'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "rider-maskable-512x512.png",
    "revision": "55a67bb21c1004ba6d683c8750050d68"
  }, {
    "url": "rider-apple-touch-icon.png",
    "revision": "1c0de51c91118646e8f578c99b671c88"
  }, {
    "url": "rider-512x512.png",
    "revision": "55a67bb21c1004ba6d683c8750050d68"
  }, {
    "url": "rider-192x192.png",
    "revision": "b38313f501a55d79d281e35e12a28502"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "6f90c8b47b7b5089dfffc7737da86e62"
  }, {
    "url": "pwa-512x512.png",
    "revision": "6f90c8b47b7b5089dfffc7737da86e62"
  }, {
    "url": "index.html",
    "revision": "9b706a27b0ca5e465b5c24228b2f8c62"
  }, {
    "url": "icon.svg",
    "revision": "71ec083ef2733f3feaf10cff3875f9ce"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "59ae78397213a960249266903702f77c"
  }, {
    "url": "admin-logo.svg",
    "revision": "71ec083ef2733f3feaf10cff3875f9ce"
  }, {
    "url": "assets/web-gKq58sz3.js",
    "revision": null
  }, {
    "url": "assets/web-Ck6cDRPD.js",
    "revision": null
  }, {
    "url": "assets/web-CVqJChNT.js",
    "revision": null
  }, {
    "url": "assets/web-BDsKXlWt.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-jrF7e2F0.js",
    "revision": null
  }, {
    "url": "assets/vendor-pdf-CUYbDkbv.js",
    "revision": null
  }, {
    "url": "assets/vendor-firebase-BoJiYniB.js",
    "revision": null
  }, {
    "url": "assets/purify.es-DedTAGkB.js",
    "revision": null
  }, {
    "url": "assets/native-BqwuirM4.js",
    "revision": null
  }, {
    "url": "assets/index.es-CsLtj_j5.js",
    "revision": null
  }, {
    "url": "assets/index-CEd8D4qD.js",
    "revision": null
  }, {
    "url": "assets/index-B2aoXRDW.css",
    "revision": null
  }, {
    "url": "assets/base-BWhR2HYf.js",
    "revision": null
  }, {
    "url": "admin-logo.svg",
    "revision": "71ec083ef2733f3feaf10cff3875f9ce"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "59ae78397213a960249266903702f77c"
  }, {
    "url": "icon.svg",
    "revision": "71ec083ef2733f3feaf10cff3875f9ce"
  }, {
    "url": "pwa-512x512.png",
    "revision": "6f90c8b47b7b5089dfffc7737da86e62"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "6f90c8b47b7b5089dfffc7737da86e62"
  }, {
    "url": "rider-192x192.png",
    "revision": "b38313f501a55d79d281e35e12a28502"
  }, {
    "url": "rider-512x512.png",
    "revision": "55a67bb21c1004ba6d683c8750050d68"
  }, {
    "url": "rider-apple-touch-icon.png",
    "revision": "1c0de51c91118646e8f578c99b671c88"
  }, {
    "url": "rider-maskable-512x512.png",
    "revision": "55a67bb21c1004ba6d683c8750050d68"
  }, {
    "url": "manifest.webmanifest",
    "revision": "4564c5641c5d1f2af500e6448e83510d"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/__.*$/]
  }));
  workbox.registerRoute(({
    request
  }) => request.mode === "navigate", new workbox.NetworkFirst({
    "cacheName": "pwa-app-shell",
    "networkTimeoutSeconds": 3,
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(({
    request
  }) => request.destination === "script" || request.destination === "style" || request.destination === "worker", new workbox.NetworkFirst({
    "cacheName": "pwa-static-assets",
    "networkTimeoutSeconds": 3,
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    }), new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 2592000
    })]
  }), 'GET');
  workbox.registerRoute(({
    url
  }) => url.pathname.includes("/statement") || url.pathname.includes("/public_statements") || url.hostname.includes("firestore.googleapis.com"), new workbox.NetworkFirst({
    "cacheName": "pwa-ledger-data",
    "networkTimeoutSeconds": 2.5,
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
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

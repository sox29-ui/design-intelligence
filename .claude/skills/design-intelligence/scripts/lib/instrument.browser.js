// DI passive instrumentation, injected before any page script (Playwright addInitScript).
// Records *that* certain APIs are used (canvas contexts, matchMedia queries, observers, scroll
// listeners, rAF volume, WAAPI). It never changes page behaviour and never records page text.
(() => {
  if (window.__DI_INSTR__) return;
  const I = (window.__DI_INSTR__ = {
    canvasContexts: {},
    webgpuRequested: false,
    matchMediaQueries: {},
    intersectionObservers: 0,
    resizeObservers: 0,
    rafCalls: 0,
    rafFirstAt: null,
    waapiAnimate: 0,
    waapiDurations: [],
    scrollListeners: 0,
    wheelListeners: 0,
    touchmoveListeners: 0,
    pointermoveListeners: 0,
    startedAt: Date.now(),
  });
  const safe = (fn) => {
    try {
      fn();
    } catch (e) {
      /* never break the page */
    }
  };
  safe(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      safe(() => {
        const k = String(type);
        I.canvasContexts[k] = (I.canvasContexts[k] || 0) + 1;
      });
      return orig.call(this, type, ...rest);
    };
  });
  safe(() => {
    if (typeof OffscreenCanvas !== 'undefined') {
      const orig = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function (type, ...rest) {
        safe(() => {
          const k = 'offscreen:' + String(type);
          I.canvasContexts[k] = (I.canvasContexts[k] || 0) + 1;
        });
        return orig.call(this, type, ...rest);
      };
    }
  });
  safe(() => {
    if (navigator.gpu && navigator.gpu.requestAdapter) {
      const orig = navigator.gpu.requestAdapter.bind(navigator.gpu);
      navigator.gpu.requestAdapter = (...a) => {
        I.webgpuRequested = true;
        return orig(...a);
      };
    }
  });
  safe(() => {
    const orig = window.matchMedia;
    window.matchMedia = function (q) {
      safe(() => {
        const k = String(q).replace(/\s+/g, ' ').trim().slice(0, 120);
        I.matchMediaQueries[k] = (I.matchMediaQueries[k] || 0) + 1;
      });
      return orig.call(window, q);
    };
  });
  safe(() => {
    const Orig = window.IntersectionObserver;
    if (!Orig) return;
    window.IntersectionObserver = class extends Orig {
      constructor(...a) {
        super(...a);
        I.intersectionObservers++;
      }
    };
  });
  safe(() => {
    const Orig = window.ResizeObserver;
    if (!Orig) return;
    window.ResizeObserver = class extends Orig {
      constructor(...a) {
        super(...a);
        I.resizeObservers++;
      }
    };
  });
  safe(() => {
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) {
      I.rafCalls++;
      if (I.rafFirstAt === null) I.rafFirstAt = Date.now() - I.startedAt;
      return orig.call(window, cb);
    };
  });
  safe(() => {
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      safe(() => {
        I.waapiAnimate++;
        const d = typeof options === 'number' ? options : options && options.duration;
        if (typeof d === 'number' && I.waapiDurations.length < 200) I.waapiDurations.push(d);
      });
      return orig.call(this, keyframes, options);
    };
  });
  safe(() => {
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, opts) {
      safe(() => {
        if (this === window || this === document || this === document.documentElement || this === document.body) {
          if (type === 'scroll') I.scrollListeners++;
          else if (type === 'wheel' || type === 'mousewheel') I.wheelListeners++;
          else if (type === 'touchmove') I.touchmoveListeners++;
          else if (type === 'pointermove' || type === 'mousemove') I.pointermoveListeners++;
        }
      });
      return orig.call(this, type, listener, opts);
    };
  });
})();

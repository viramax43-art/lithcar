/**
 * locate-fix-shim.js — hot-fix for the driver map "Моё местоположение" button.
 *
 * Loaded as a plain <script> in <head> BEFORE the app bundle (see
 * tmp_remote_deploy_locate_shim.sh). It fixes the two root causes that make the
 * locate button look dead inside Telegram's WebView:
 *
 *  1. `navigator.geolocation.getCurrentPosition(..., {enableHighAccuracy:true,
 *     timeout:8000})` - and `watchPosition`, which the driver "Новое предложение"
 *     page uses with a 10-15 s budget - never calls back in some Telegram
 *     WebViews. The success handler then never runs and the screen just sits
 *     there (that page swallows the rejection, so the locate button looks dead).
 *     Native geolocation is kept (it still shows the browser permission prompt),
 *     but it is raced against Telegram.WebApp.LocationManager (Bot API 8+) and a
 *     parallel watch/one-shot ladder; the first fix that arrives wins.
 *  2. Leaflet binds `touchstart`/`mousedown` on the map container, so the tap on
 *     the in-map button was consumed by the map drag and the app's click handler
 *     never ran. We re-dispatch a synthetic click when the real click did not
 *     happen within 500 ms (React listens for click at the root container, so a
 *     bubbling synthetic event reaches the app's onClick).
 *  3. The driver cabinet keeps its map mounted behind the full-screen driver
 *     pages, and the in-map button uses z-[1000] so it can float above Leaflet's
 *     panes (z-400). `.leaflet-container` does not create a stacking context, so
 *     that z-index competes in the page root: the button also painted - and took
 *     taps - above those pages, which are only z-[200] ("Мои поездки"/"Мои
 *     предложения") and z-[210] ("Новое предложение"). The driver therefore saw
 *     TWO crosshair buttons on the offer page (the page's own one plus the map's
 *     one on top of it) and the tap went to the map's button, which called
 *     flyTo() on the map hidden behind the page - so it looked dead. We hide the
 *     in-map button while such a page is open; every one of them brings its own
 *     locate button.
 *     The hide runs off a MutationObserver on <body>, but this file is loaded as
 *     a classic <script> in <head> - i.e. while `document.body` is still null -
 *     so v4 attached no observer at all: the single sync it ran saw an empty
 *     document and the duplicate stayed on screen. The watcher is therefore
 *     deferred to DOMContentLoaded, retried while the app boots, re-run on every
 *     tap (the pages open on a tap) and re-asserted shortly after each hide
 *     (React re-applies the cabinet map's inline style on its own re-renders).
 *
 *  4. The same page seeds its «Свободных мест» ("seats") field with 1: the input is
 *     a controlled React input (`value={model.totalSeatsInput}`) whose state starts
 *     as `useState('1')` and whose onBlur normaliser writes '1' back into an empty
 *     field, so the driver had to clear a 1 before typing anything and every tap on
 *     the field put the 1 back. The seeded 1 is cleared through the input's native
 *     value setter plus a bubbling `input` event - the only write a controlled input
 *     accepts - and re-cleared after a blur until the driver actually types
 *     something, so the field stays empty by default.
 *
 * It is a no-op when the mechanisms already work, and can be disabled at any
 * time by removing the <script> tag (or by setting
 * window.__RIDE_LOCATE_FIX_DISABLED__ = true before it loads). The seats fix alone
 * can be switched off with window.__RIDE_OFFER_SEATS_FIX_DISABLED__ = true.
 */
(function () {
  'use strict'
  var w = typeof window !== 'undefined' ? window : null
  if (!w || w.__RIDE_LOCATE_FIX__ || w.__RIDE_LOCATE_FIX_DISABLED__) return
  w.__RIDE_LOCATE_FIX__ = true

  var FIX_TIMEOUT_MS = 15000
  var GOOD_ACCURACY_M = 80
  var NATIVE_HEAD_START_MS = typeof w.__RIDE_LOCATE_FIX_HEAD_START_MS__ === 'number' ? w.__RIDE_LOCATE_FIX_HEAD_START_MS__ : 1200
  // The fallback must start inside the app's own budget: the driver
  // "Новое предложение" page asks through watchPosition with a 10-15 s timeout and
  // only accepts a fix at/under 35 m (button) or 120 m (prefill) - anything coarser
  // makes it wait for its own timeout. Sources are therefore raced in parallel, the
  // best fix so far is pushed into the app again on every improvement, and a fix
  // this page received seconds ago is re-used instead of asking the device twice.
  var NATIVE_WATCH_GRACE_MS = typeof w.__RIDE_LOCATE_FIX_GRACE_MS__ === 'number' ? w.__RIDE_LOCATE_FIX_GRACE_MS__ : 1200
  var COARSE_SOURCE_DELAY_MS = typeof w.__RIDE_LOCATE_FIX_COARSE_DELAY_MS__ === 'number' ? w.__RIDE_LOCATE_FIX_COARSE_DELAY_MS__ : 1200
  var CACHE_MAX_AGE_MS = typeof w.__RIDE_LOCATE_FIX_CACHE_MS__ === 'number' ? w.__RIDE_LOCATE_FIX_CACHE_MS__ : 10000
  var TELEGRAM_SLICE_MS = 12000
  var DENIED_RESCUE_MS = 8000
  var TAP_RESCUE_DELAY_MS = 0
  var REAL_CLICK_GRACE_MS = 500
  var OVERLAY_SYNC_DELAY_MS = 60
  var OVERLAY_REASSERT_DELAY_MS = 500
  var OVERLAY_REASSERT_LIMIT = 2
  // This file runs in <head>, where `document.body` does not exist yet, so the
  // body observer is attached on DOMContentLoaded and on these retries.
  var OVERLAY_WATCH_RETRY_MS = [0, 300, 1000, 2500]
  // Bug 4: the seeded default of the "Новое предложение" seats field. The row is
  // matched by its label in every locale the app ships (i18n key
  // driver.offers.seats) because the shim cannot know which language the driver
  // picked; the field itself is the numeric input inside that row.
  var SEATS_DEFAULT_VALUE = '1'
  var SEATS_PLACEHOLDER = 'Сколько'
  var SEATS_ROW_ATTR = 'data-locate-fix-seats'
  var SEATS_TYPED_ATTR = 'data-locate-fix-seats-typed'
  var SEATS_LABEL_MAX_HOPS = 4
  var SEATS_LABEL_NEEDLES = [
    'свободных мест', 'свободные места', 'свободное место',
    'available seats', 'seats left',
    'wolne miejsca', 'laisvos vietos',
  ]
  var SEATS_BLUR_RECHECK_MS = 0

  function log() {
    try {
      var args = [].slice.call(arguments)
      args.unshift('[locate-fix]')
      if (w.console && w.console.log) w.console.log.apply(w.console, args)
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ */
  /* Telegram WebApp LocationManager (Bot API 8+)                        */
  /* ------------------------------------------------------------------ */

  function telegramManager() {
    var tg = w.Telegram && w.Telegram.WebApp
    if (!tg || !tg.LocationManager) return null
    if (tg.isVersionAtLeast && !tg.isVersionAtLeast('8.0')) return null
    return tg.LocationManager
  }

  function telegramLocation(timeoutMs) {
    var manager = telegramManager()
    if (!manager || !manager.getLocation) return Promise.resolve(null)
    return new Promise(function (resolve) {
      var settled = false
      var done = function (value) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      }
      var timer = setTimeout(function () { done(null) }, Math.min(timeoutMs, 12000))
      var request = function () {
        try {
          manager.getLocation(function (location) {
            if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
              done({
                lat: location.latitude,
                lng: location.longitude,
                accuracy: typeof location.horizontal_accuracy === 'number' ? location.horizontal_accuracy : 25,
              })
              return
            }
            done(null)
          })
        } catch (error) {
          log('LocationManager.getLocation failed', error)
          done(null)
        }
      }
      if (manager.isInited) { request(); return }
      try { manager.init(request) } catch (error) { request() }
    })
  }

  /* ------------------------------------------------------------------ */
  /* Position helpers                                                    */
  /* ------------------------------------------------------------------ */

  function fromNativePosition(position) {
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : 9999,
    }
  }

  function toGeolocationPosition(fix) {
    return {
      coords: {
        latitude: fix.lat,
        longitude: fix.lng,
        accuracy: fix.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: function () { return this },
      },
      timestamp: Date.now(),
    }
  }

  function unavailableError() {
    var error = new Error('position unavailable')
    error.code = 2
    error.POSITION_UNAVAILABLE = 2
    error.PERMISSION_DENIED = 1
    error.TIMEOUT = 3
    return error
  }

  var nativeGeo = typeof navigator !== 'undefined' ? navigator.geolocation : null
  var nativeGetCurrentPosition = nativeGeo && nativeGeo.getCurrentPosition ? nativeGeo.getCurrentPosition : null
  var nativeWatchPosition = nativeGeo && nativeGeo.watchPosition ? nativeGeo.watchPosition : null
  var nativeClearWatch = nativeGeo && nativeGeo.clearWatch ? nativeGeo.clearWatch : null
  var cache = { lat: null, lng: null, accuracy: 9999, at: 0 }
  var lastFix = null
  var pendingTelegram = null

  function rememberFix(fix) {
    if (!fix) return fix
    cache.lat = fix.lat
    cache.lng = fix.lng
    cache.accuracy = fix.accuracy
    cache.at = Date.now()
    return fix
  }

  /** A fix from this page session, recent enough to answer a repeated request. */
  function freshCacheFix() {
    if (cache.lat === null) return null
    if (Date.now() - cache.at > CACHE_MAX_AGE_MS) return null
    return { lat: cache.lat, lng: cache.lng, accuracy: cache.accuracy }
  }

  /**
   * Share one in-flight Telegram request: the offer page asks twice (map prefill
   * plus the locate button) and two concurrent LocationManager dialogs made the
   * answer flaky.
   */
  function telegramShared(timeoutMs) {
    if (pendingTelegram) return pendingTelegram
    var promise = telegramLocation(timeoutMs)
    pendingTelegram = promise
    var clear = function () { if (pendingTelegram === promise) pendingTelegram = null }
    promise.then(clear, clear)
    return promise
  }

  /** One watchPosition attempt: resolves with the best fix or null after `timeoutMs`. */
  function watchAttempt(highAccuracy, timeoutMs) {
    return new Promise(function (resolve) {
      if (!nativeWatchPosition) { resolve(null); return }
      var best = null
      var watchId = null
      var settled = false
      var finish = function (value) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (watchId !== null && nativeClearWatch) { try { nativeClearWatch.call(nativeGeo, watchId) } catch (e) { /* ignore */ } }
        resolve(value)
      }
      var timer = setTimeout(function () { finish(best) }, timeoutMs)
      try {
        watchId = nativeWatchPosition.call(nativeGeo,
          function (position) {
            var fix = fromNativePosition(position)
            if (!best || fix.accuracy < best.accuracy) best = fix
            rememberFix(best)
            if (fix.accuracy <= (highAccuracy ? GOOD_ACCURACY_M : 500)) finish(fix)
          },
          function () { /* native failure is expected in Telegram WebViews */ },
          {
            enableHighAccuracy: !!highAccuracy,
            maximumAge: highAccuracy ? 0 : 120000,
            timeout: timeoutMs,
          },
        )
      } catch (error) {
        log('watchPosition threw', error)
        finish(null)
      }
    })
  }

  /** One getCurrentPosition attempt (cached positions are acceptable here). */
  function oneShot(timeoutMs) {
    return new Promise(function (resolve) {
      if (!nativeGetCurrentPosition) { resolve(null); return }
      var settled = false
      var finish = function (value) { if (!settled) { settled = true; resolve(value) } }
      var timer = setTimeout(function () { finish(null) }, timeoutMs + 500)
      try {
        nativeGetCurrentPosition.call(nativeGeo,
          function (position) { clearTimeout(timer); finish(rememberFix(fromNativePosition(position))) },
          function () { clearTimeout(timer); finish(null) },
          { enableHighAccuracy: false, maximumAge: 300000, timeout: timeoutMs })
      } catch (error) {
        clearTimeout(timer)
        finish(null)
      }
    })
  }

  /**
   * First usable fix wins.
   *
   * The sources are raced in parallel: the old serial ladder (Telegram up to
   * 12 s, then an accurate watch up to 10 s, then a coarse watch, then a
   * one-shot) could spend 30 s+ and therefore delivered nothing inside the
   * app's own 10-15 s budget. Coarse providers are delayed by
   * COARSE_SOURCE_DELAY_MS so that on a healthy device the accurate native path
   * still wins first and working behaviour stays unchanged.
   */
  function resolvePosition(timeoutMs, onFix) {
    var budget = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : FIX_TIMEOUT_MS
    return new Promise(function (resolve) {
      var startedAt = Date.now()
      var settled = false
      var remaining = 5
      var coarseTimer = null
      var budgetTimer = null

      var finish = function (fix, source) {
        if (settled) return
        settled = true
        if (coarseTimer) { clearTimeout(coarseTimer); coarseTimer = null }
        if (budgetTimer) { clearTimeout(budgetTimer); budgetTimer = null }
        if (fix) {
          rememberFix(fix)
          lastFix = { source: source, accuracy: Math.round(fix.accuracy), ms: Date.now() - startedAt }
          log('fix via ' + source, lastFix.accuracy + 'm', lastFix.ms + 'ms')
        } else {
          log('no fix within ' + budget + 'ms')
        }
        resolve(fix)
      }

      var finishWithCache = function () {
        if (cache.lat !== null) finish({ lat: cache.lat, lng: cache.lng, accuracy: 9999 }, 'cache')
        else finish(null, null)
      }

      var give = function (source, promise) {
        promise.then(function (fix) {
          remaining--
          if (fix) {
            log('source ' + source + ' -> ' + Math.round(fix.accuracy) + 'm')
            if (onFix) { try { onFix(fix, source) } catch (e) { log('onFix threw', e) } }
          }
          if (settled) return
          if (fix) { finish(fix, source); return }
          if (remaining === 0) finishWithCache()
        }, function (error) {
          remaining--
          log(source + ' failed', error)
          if (!settled && remaining === 0) finishWithCache()
        })
      }

      give('cache', Promise.resolve(freshCacheFix()))
      give('telegram', telegramShared(Math.min(budget, TELEGRAM_SLICE_MS)))
      give('watch-accurate', watchAttempt(true, Math.min(budget, 10000)))
      coarseTimer = setTimeout(function () {
        coarseTimer = null
        if (settled) return
        give('watch-coarse', watchAttempt(false, Math.min(budget, 10000)))
        give('one-shot', oneShot(6000))
      }, Math.min(COARSE_SOURCE_DELAY_MS, budget))
      budgetTimer = setTimeout(function () {
        budgetTimer = null
        finishWithCache()
      }, budget)
    })
  }

  /* ------------------------------------------------------------------ */
  /* geolocation patching                                                */
  /* ------------------------------------------------------------------ */

  if (nativeGeo && nativeGetCurrentPosition) {
    var patchedWatches = {}
    var nextPatchedWatchId = 900000

    nativeGeo.getCurrentPosition = function (success, error, options) {
      var nativeOptions = options || {}
      var nativeTimeout = typeof nativeOptions.timeout === 'number' && nativeOptions.timeout > 0 ? nativeOptions.timeout : 8000
      var budget = nativeTimeout + 6000
      var settled = false
      var nativeFailed = null
      var headStartTimer = null
      var finish = function (fix, err) {
        if (settled) return
        settled = true
        if (headStartTimer) { clearTimeout(headStartTimer); headStartTimer = null }
        if (fix) {
          log('getCurrentPosition resolved', fix.lat, fix.lng, Math.round(fix.accuracy) + 'm')
          if (success) { try { success(toGeolocationPosition(fix)) } catch (e) { log('success callback threw', e) } }
          return
        }
        var failure = err || nativeFailed || unavailableError()
        if (error) { try { error(failure) } catch (e) { log('error callback threw', e) } }
      }

      // Native call first: it triggers the browser permission prompt and is the
      // fastest path on devices where it works.
      try {
        nativeGetCurrentPosition.call(nativeGeo,
          function (position) { finish(rememberFix(fromNativePosition(position)), null) },
          function (nativeError) {
            // A WebView denial (code 1) is not final: Telegram's own
            // LocationManager has a separate permission flow and can still
            // answer - in the app code it is the first source that is tried.
            if (nativeError && nativeError.code === 1) {
              nativeFailed = nativeError
              if (headStartTimer) { clearTimeout(headStartTimer); headStartTimer = null }
              if (!settled) {
                log('native geolocation denied - asking Telegram.LocationManager')
                telegramShared(Math.min(budget, DENIED_RESCUE_MS)).then(function (fix) { finish(fix, nativeFailed) })
              }
              return
            }
            nativeFailed = nativeError
          },
          nativeOptions)
      } catch (thrown) { nativeFailed = thrown }

      // Only if the native path stays silent for NATIVE_HEAD_START_MS (the known
      // Telegram WebView bug) we fall back to Telegram.WebApp.LocationManager and
      // the watch/one-shot ladder, so working devices keep their own GPS fix and
      // never see an unexpected Telegram permission dialog.
      headStartTimer = setTimeout(function () {
        headStartTimer = null
        if (settled) return
        resolvePosition(budget).then(function (fix) { finish(fix, null) })
      }, NATIVE_HEAD_START_MS)
    }

    if (nativeWatchPosition) {
      nativeGeo.watchPosition = function (success, error, options) {
        var patchedId = nextPatchedWatchId++
        var entry = { success: success, error: error, nativeId: null, timer: null, spoke: false, best: Infinity }
        var requestedTimeout = options && typeof options.timeout === 'number' && options.timeout > 0 ? options.timeout : 0
        var watchBudget = requestedTimeout ? Math.min(FIX_TIMEOUT_MS, requestedTimeout + 2000) : FIX_TIMEOUT_MS
        var nativeId = null
        try {
          nativeId = nativeWatchPosition.call(nativeGeo,
            function (position) {
              entry.spoke = true
              if (entry.timer) { clearTimeout(entry.timer); entry.timer = null }
              var nativeFix = rememberFix(fromNativePosition(position))
              if (nativeFix.accuracy < entry.best) entry.best = nativeFix.accuracy
              if (success) { try { success(position) } catch (e) { log('watch callback threw', e) } }
            },
            function (nativeError) {
              if (error) { try { error(nativeError) } catch (e) { log('watch error callback threw', e) } }
            },
            options)
        } catch (thrown) { log('watchPosition threw', thrown) }
        entry.nativeId = nativeId
        // Telegram WebViews sometimes never deliver a watch fix: feed one fix so
        // the app's own tracking ("калибровка") starts working.
        entry.timer = setTimeout(function () {
          entry.timer = null
          if (entry.spoke || !patchedWatches[patchedId]) return
          log('watch fallback started (budget ' + watchBudget + 'ms)')
          resolvePosition(watchBudget, function (fix, source) {
            // Hand the app every improvement: it keeps waiting until a fix meets
            // its own accuracy window (35 m / 120 m), so a late accurate fix must
            // still reach it instead of the app timing out first.
            if (!patchedWatches[patchedId]) return
            if (fix.accuracy >= entry.best) return
            entry.best = fix.accuracy
            entry.spoke = true
            log('watch fallback -> ' + source, Math.round(fix.accuracy) + 'm')
            if (entry.success) { try { entry.success(toGeolocationPosition(fix)) } catch (e) { log('watch success callback threw', e) } }
          })
        }, NATIVE_WATCH_GRACE_MS)
        patchedWatches[patchedId] = entry
        return patchedId
      }

      nativeGeo.clearWatch = function (id) {
        var entry = patchedWatches[id]
        if (entry) {
          delete patchedWatches[id]
          if (entry.timer) clearTimeout(entry.timer)
          if (entry.nativeId !== null && entry.nativeId !== undefined && nativeClearWatch) {
            try { nativeClearWatch.call(nativeGeo, entry.nativeId) } catch (e) { /* ignore */ }
          }
          return
        }
        if (nativeClearWatch) { try { nativeClearWatch.call(nativeGeo, id) } catch (e) { /* ignore */ } }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* tap rescue for the in-map locate button                             */
  /* ------------------------------------------------------------------ */

  var LOCATE_TITLE_NEEDLES = ['моё местоположение', 'мое местоположение', 'my location', 'mano vieta', 'moja lokalizacja', 'lokalizacja', 'локация']
  var lastRealClickAt = 0
  var lastSyntheticClickAt = 0

  function isLocateButton(target) {
    if (!target || target.nodeType !== 1) return false
    if (String(target.tagName || '').toUpperCase() !== 'BUTTON') return false
    var className = typeof target.className === 'string' ? target.className : ''
    if (className.indexOf('bottom-6 right-4') === -1) {
      var title = String((target.getAttribute && target.getAttribute('title')) || '').toLowerCase()
      var titled = false
      for (var i = 0; i < LOCATE_TITLE_NEEDLES.length; i++) {
        if (title.indexOf(LOCATE_TITLE_NEEDLES[i]) !== -1) { titled = true; break }
      }
      if (!titled) return false
    }
    return !!(target.closest && target.closest('.leaflet-container'))
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function (event) {
      if (isLocateButton(event.target)) lastRealClickAt = Date.now()
      // Every tap can open a full-screen page (the duplicate's trigger), so the
      // reconcile runs right after the tap even without a DOM observer.
      scheduleOverlaySync()
    }, true)

    var handleTap = function (event) {
      if (!isLocateButton(event.target)) return
      var button = event.target
      setTimeout(function () {
        var now = Date.now()
        if (now - lastRealClickAt < REAL_CLICK_GRACE_MS) return
        if (now - lastSyntheticClickAt < REAL_CLICK_GRACE_MS) return
        if (button.isConnected === false) return
        lastSyntheticClickAt = now
        log('tap rescue: re-dispatching click on the locate button')
        try {
          button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: w }))
        } catch (error) {
          log('tap rescue dispatch failed', error)
        }
      }, TAP_RESCUE_DELAY_MS)
    }

    var TAP_EVENTS = ['pointerup', 'touchend', 'mouseup']
    for (var t = 0; t < TAP_EVENTS.length; t++) {
      document.addEventListener(TAP_EVENTS[t], handleTap, true)
    }
  }

  /* ------------------------------------------------------------------ */
  /* duplicate in-map locate button behind the full-screen pages          */
  /* ------------------------------------------------------------------ */

  // See bug 3 in the header. The map's own button (z-[1000]) escapes the map's
  // stacking context, so it painted - and swallowed taps - above the driver
  // pages that cover the whole screen (z-[200]/z-[210]). Every one of those pages
  // carries its own locate button, so the in-map one is hidden while they are up.
  var OVERLAY_SELECTOR = 'div.fixed.inset-0[class*="z-[200]"],div.fixed.inset-0[class*="z-[210]"]'
  var HIDDEN_ATTR = 'data-locate-fix-hidden'
  var HIDDEN_DISPLAY_ATTR = 'data-locate-fix-display'
  var overlaysWatched = false
  var overlayObserver = null
  var syncScheduled = false
  var lastSyncChanged = false

  /** The full-screen page that currently covers the map, if any. */
  function openOverlay() {
    if (!document.querySelector) return null
    try {
      var overlay = document.querySelector(OVERLAY_SELECTOR)
      return overlay && overlay.nodeType === 1 ? overlay : null
    } catch (error) {
      return null
    }
  }

  /** The in-map locate buttons that the open page does not contain itself. */
  function strayMapButtons(overlay) {
    var found = []
    if (!document.querySelectorAll) return found
    var nodes = document.querySelectorAll('.leaflet-container button')
    for (var i = 0; i < nodes.length; i++) {
      var button = nodes[i]
      if (!isLocateButton(button)) continue
      // a page that shows its own map keeps that map's button
      if (overlay && overlay.contains && overlay.contains(button)) continue
      found.push(button)
    }
    return found
  }

  function setButtonHidden(button, hidden) {
    if (!button || !button.style) return
    if (hidden) {
      var marked = button.getAttribute(HIDDEN_ATTR) === '1'
      // A React re-render can re-apply the button's own inline style; a marker
      // left over from an earlier hide must not stop the reconcile.
      if (marked && button.style.display === 'none') return
      if (!marked) button.setAttribute(HIDDEN_DISPLAY_ATTR, button.style.display || '')
      button.style.display = 'none'
      button.setAttribute(HIDDEN_ATTR, '1')
      return
    }
    if (button.getAttribute(HIDDEN_ATTR) !== '1') return
    var previous = button.getAttribute(HIDDEN_DISPLAY_ATTR) || ''
    button.removeAttribute(HIDDEN_ATTR)
    button.removeAttribute(HIDDEN_DISPLAY_ATTR)
    if (previous) button.style.display = previous
    else if (button.style.removeProperty) button.style.removeProperty('display')
    else button.style.display = ''
  }

  /** Debounced reconcile: React paints the page only after the tap that opened it. */
  function scheduleOverlaySync() {
    if (syncScheduled) return
    syncScheduled = true
    setTimeout(function () {
      syncScheduled = false
      runOverlaySync(0)
    }, OVERLAY_SYNC_DELAY_MS)
  }

  /**
   * Reconcile + a bounded re-assert. Re-applying the button's inline style is not
   * a DOM mutation, so no observer would notice it - but it is what makes the
   * duplicate pop back up, hence the short follow-up.
   */
  function runOverlaySync(depth) {
    var level = depth || 0
    lastSyncChanged = false
    try { syncDuplicateLocateButtons() } catch (error) { log('overlay sync failed', error) }
    try { syncOfferSeatsDefault() } catch (error) { log('seats sync failed', error) }
    // A React re-render right after the clear can put a value back, so the seats
    // rule re-asserts together with the duplicate-button rule.
    if ((lastSyncChanged || lastSeatsCleared) && level < OVERLAY_REASSERT_LIMIT) {
      setTimeout(function () { runOverlaySync(level + 1) }, OVERLAY_REASSERT_DELAY_MS)
    }
  }

  /** Idempotent: hides the stray map buttons while a page is up, restores after. */
  function syncDuplicateLocateButtons() {
    var overlay = openOverlay()
    var buttons = strayMapButtons(overlay)
    var changed = 0
    for (var i = 0; i < buttons.length; i++) {
      var wasHidden = buttons[i].getAttribute(HIDDEN_ATTR) === '1'
      setButtonHidden(buttons[i], !!overlay)
      if (wasHidden !== !!overlay) changed++
    }
    lastSyncChanged = changed > 0
    if (changed) {
      log(overlay
        ? 'hid ' + changed + ' in-map locate button(s) behind the open page'
        : 'restored ' + changed + ' in-map locate button(s)')
    }
    return buttons.length
  }

  /** Attaches the body observer; false while the document has no <body> yet. */
  function attachOverlayObserver() {
    if (overlayObserver || !w.MutationObserver || typeof document === 'undefined') return !!overlayObserver
    if (!document.body) return false
    try {
      overlayObserver = new w.MutationObserver(scheduleOverlaySync)
      overlayObserver.observe(document.body, { childList: true, subtree: true })
      return true
    } catch (error) {
      log('overlay observer failed', error)
      return false
    }
  }

  /**
   * The pages are React-rendered, so watch the DOM (debounced) instead of only
   * reacting to taps: the very first paint of "Новое предложение" already shows
   * the duplicate, and a remounted button must be hidden again.
   *
   * This file is a classic <script> in <head>, so `document.body` does not exist
   * yet when it runs and the observer cannot be attached right away. That is the
   * v4 bug: nothing was observed, the sync ran on an empty document and the
   * duplicate stayed on screen. Hence DOMContentLoaded + a short retry ladder.
   */
  function watchOverlays() {
    if (overlaysWatched || typeof document === 'undefined') return
    overlaysWatched = true
    runOverlaySync(0)
    if (!attachOverlayObserver()) {
      var retrySync = function () {
        attachOverlayObserver()
        runOverlaySync(0)
      }
      if (document.addEventListener) document.addEventListener('DOMContentLoaded', retrySync)
      for (var r = 0; r < OVERLAY_WATCH_RETRY_MS.length; r++) setTimeout(retrySync, OVERLAY_WATCH_RETRY_MS[r])
    }
    if (document.addEventListener) document.addEventListener('visibilitychange', scheduleOverlaySync)
  }

  /* ------------------------------------------------------------------ */
  /* the "Новое предложение" form seeds «Свободных мест» with 1 (bug 4)   */
  /* ------------------------------------------------------------------ */

  // See bug 4 in the header. The field is a controlled React input
  // (`value={model.totalSeatsInput}`, `useState('1')` in
  // useDriverOfferFormController.ts) and the app's onBlur normaliser writes '1'
  // back into an empty field. A plain DOM write is reverted by the next React
  // render, so the clear goes through the input's NATIVE value setter plus a
  // bubbling `input` event: that is exactly what React's onChange needs in order
  // to store '' as the new state and render the field empty. From then on the
  // field only ever holds what the driver typed - tracked from trusted `input`
  // events (the shim's own synthetic event is untrusted, so it can never be
  // mistaken for the driver typing 1).
  var lastSeatsCleared = false

  function seatsFixDisabled() {
    return !!w.__RIDE_OFFER_SEATS_FIX_DISABLED__
  }

  function nodeText(node) {
    if (!node) return ''
    if (typeof node.textContent === 'string') return node.textContent
    if (typeof node.innerText === 'string') return node.innerText
    return ''
  }

  /** The seats field: the numeric input of a row labelled «Свободных мест». */
  function isOfferSeatsInput(input) {
    if (!input || input.nodeType !== 1) return false
    if (String(input.tagName || '').toUpperCase() !== 'INPUT') return false
    var mode = input.getAttribute ? String(input.getAttribute('inputmode') || '') : ''
    var pattern = input.getAttribute ? String(input.getAttribute('pattern') || '') : ''
    var type = input.getAttribute ? String(input.getAttribute('type') || '') : ''
    mode = mode.toLowerCase()
    type = type.toLowerCase()
    if (mode !== 'numeric' && type !== 'number' && pattern !== '[0-9]*') return false
    var node = input.parentNode
    for (var hops = 0; node && hops < SEATS_LABEL_MAX_HOPS; hops++) {
      var text = nodeText(node).toLowerCase()
      if (text) {
        for (var n = 0; n < SEATS_LABEL_NEEDLES.length; n++) {
          if (text.indexOf(SEATS_LABEL_NEEDLES[n]) !== -1) return true
        }
      }
      node = node.parentNode
    }
    return false
  }

  function offerSeatsInputs() {
    var found = []
    if (typeof document === 'undefined' || !document.querySelectorAll) return found
    var nodes = null
    try { nodes = document.querySelectorAll('input') } catch (error) { return found }
    if (!nodes) return found
    for (var i = 0; i < nodes.length; i++) {
      if (isOfferSeatsInput(nodes[i])) found.push(nodes[i])
    }
    return found
  }

  function currentSeatsValue(input) {
    var value = input ? input.value : ''
    if (typeof value === 'string') return value
    return String(value === undefined || value === null ? '' : value)
  }

  /**
   * Writes the value the way React's own onChange sees it: the native value setter
   * bypasses React's value tracker, the bubbling `input` event makes the app store
   * the new state (`setTotalSeatsInput('')`), and the controlled input then renders
   * empty. Assigning `input.value = ''` alone would be reverted by the next render.
   */
  function writeSeatsValue(input, value) {
    var descriptor = null
    try {
      if (w.HTMLInputElement && w.HTMLInputElement.prototype && Object.getOwnPropertyDescriptor) {
        descriptor = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value')
      }
    } catch (error) { descriptor = null }
    if (descriptor && typeof descriptor.set === 'function') {
      try { descriptor.set.call(input, value) } catch (error) { input.value = value }
    } else {
      input.value = value
    }
    var event = null
    try { event = new Event('input', { bubbles: true }) } catch (error) { event = null }
    if (!event && document.createEvent) {
      try {
        event = document.createEvent('Event')
        event.initEvent('input', true, false)
      } catch (error) { event = null }
    }
    if (event && input.dispatchEvent) input.dispatchEvent(event)
  }

  /** The app's blur normaliser turns '01' into '1' - that is still what was typed. */
  function seatsValueWasTyped(typed, current) {
    if (!typed) return false
    if (typed === current) return true
    var typedNumber = parseInt(typed, 10)
    var currentNumber = parseInt(current, 10)
    if (!isFinite(typedNumber) || !isFinite(currentNumber)) return false
    return typedNumber === currentNumber
  }

  function writeSeatsPlaceholder(input) {
    if (!input || !input.setAttribute) return
    try { input.placeholder = SEATS_PLACEHOLDER } catch (error) { /* the attribute is enough */ }
    if (!input.getAttribute || input.getAttribute('placeholder') !== SEATS_PLACEHOLDER) {
      input.setAttribute('placeholder', SEATS_PLACEHOLDER)
    }
  }

  /**
   * Idempotent reconcile, run from every overlay sync (body observer, tap,
   * visibilitychange) and again right after a blur: it clears the seeded '1' while
   * the driver has typed nothing, and leaves a typed value alone.
   */
  function syncOfferSeatsDefault() {
    lastSeatsCleared = false
    if (seatsFixDisabled()) return 0
    var inputs = offerSeatsInputs()
    var cleared = 0
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i]
      if (input.getAttribute(SEATS_ROW_ATTR) !== '1') {
        input.setAttribute(SEATS_ROW_ATTR, '1')
        writeSeatsPlaceholder(input)
      }
      var value = currentSeatsValue(input)
      if (value !== SEATS_DEFAULT_VALUE) continue
      if (seatsValueWasTyped(input.getAttribute(SEATS_TYPED_ATTR), value)) continue
      writeSeatsValue(input, '')
      cleared++
      log('cleared the seeded "Свободных мест" value (1 -> empty)')
    }
    lastSeatsCleared = cleared > 0
    return cleared
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    // The driver's own keystrokes / IME commits are the only trusted `input`
    // events; the shim's synthetic clear is untrusted and therefore ignored here.
    document.addEventListener('input', function (event) {
      var target = event.target
      if (!target || event.isTrusted === false || !isOfferSeatsInput(target)) return
      target.setAttribute(SEATS_TYPED_ATTR, currentSeatsValue(target))
    }, true)

    // The app normalises an empty field to '1' on blur, so re-check right after its
    // blur handler ran (React flushes that discrete update before the timer fires).
    document.addEventListener('focusout', function (event) {
      if (!event.target || !isOfferSeatsInput(event.target)) return
      setTimeout(function () { runOverlaySync(0) }, SEATS_BLUR_RECHECK_MS)
    }, true)
  }

  watchOverlays()

  w.__locateFixShim__ = {
    version: 'locate-fix-shim-6',
    isLocateButton: isLocateButton,
    syncDuplicateLocateButtons: syncDuplicateLocateButtons,
    openOverlay: openOverlay,
    attachOverlayObserver: attachOverlayObserver,
    scheduleOverlaySync: scheduleOverlaySync,
    isOfferSeatsInput: isOfferSeatsInput,
    offerSeatsInputs: offerSeatsInputs,
    syncOfferSeatsDefault: syncOfferSeatsDefault,
    seatsFixDisabled: seatsFixDisabled,
    seatsDefaultValue: SEATS_DEFAULT_VALUE,
    seatsPlaceholder: SEATS_PLACEHOLDER,
    resolvePosition: resolvePosition,
    graceMs: NATIVE_WATCH_GRACE_MS,
    coarseDelayMs: COARSE_SOURCE_DELAY_MS,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS,
    headStartMs: NATIVE_HEAD_START_MS,
    fixTimeoutMs: FIX_TIMEOUT_MS,
    lastFix: function () { return lastFix },
  }
  log('installed', w.__locateFixShim__.version)
})()

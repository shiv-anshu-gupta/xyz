/**
 * createState.js
 * 
 * Lightweight deep-reactive state management with flexible DOM binding.
 * 
 * Features:
 * - Deep reactivity: Nested objects, arrays, and Maps are fully reactive using Proxies.
 * - State change subscriptions: Listen to all or specific property changes.
 * - Flexible DOM binding: Bind state to any DOM property (e.g. value, textContent, innerHTML) or attribute (e.g. data-*), with one-way or two-way sync.
 * - Clean API: No dependency on frameworks. Suitable for vanilla JS, widgets, and demos.
 * 
 * Best Practices:
 * - Use state for application data, and use DOM binding for presentation/UI.
 * - For forms, consider a separate UI state to avoid polluting main state while editing.
 * - Use subscription for non-DOM side-effects (e.g., analytics, logging, computed props).
 * 
 * Example Usage:
 * 
 * // ----- STATE CREATION -----
 * // Primitives, objects, arrays, or Maps can be passed in
 * const state = createState({ 
 *   user: { name: "Alice", age: 30 },
 *   isDark: false,
 *   counter: 0,
 *   notes: ["first", "second"],
 *   settings: new Map([['theme', 'light'], ['lang', 'en']])
 * });
 * 
 * // ----- STATE GET/SET -----
 * state.counter++;            // Set primitive
 * console.log(state.counter); // Get
 * state.user.name = "Bob";    // Set nested
 * state.notes.push("third");  // Arrays work too
 * 
 * // ----- MAP USAGE -----
 * state.settings.set('theme', 'dark');
 * console.log(state.settings.get('theme'));
 * state.settings.delete('lang');
 * state.settings.set('profile', { city: 'NY' });
 * state.settings.get('profile').city = 'LA'; // Deep reactivity for Map values
 * 
 * // ----- SUBSCRIBE TO CHANGES -----
 * // Listen to all changes (including Map changes)
 * state.subscribe(change => {
 *   // change.path: array of keys (e.g. ['user','name'] or ['settings','theme'])
 *   // change.newValue, change.oldValue, change.prop, change.root
 *   console.log("Changed:", change.path.join("."), change.oldValue, "→", change.newValue);
 * });
 * 
 * // Unsubscribe: state.unsubscribe(fn)
 * 
 * // ----- DOM BINDING -----
 * // <input id="nameInput">   <span id="nameDisplay"></span>
 * // One-way: state → DOM
 * state.bindToDOM('user.name', '#nameDisplay', { prop: 'textContent' });
 * // Two-way: input ↔ state
 * state.bindToDOM('user.name', '#nameInput', { twoWay: true });
 * 
 * // Bind to Map value
 * // <span id="themeDisplay"></span>
 * state.bindToDOM(['settings','theme'], '#themeDisplay', { prop: 'textContent' });
 * 
 * // Bind to attribute
 * state.bindToDOM('user.name', '#nameDisplay', { attr: 'data-username' });
 * 
 * // Bind to checkbox
 * // <input id="isDark" type="checkbox">
 * state.bindToDOM('isDark', '#isDark', { twoWay: true });
 * 
 * // Bind to innerHTML
 * state.bindToDOM('notes', '#notesList', { prop: 'innerHTML' });
 * 
 * // ----- UNBINDING -----
 * // Returns an unbind function
 * const unbind = state.bindToDOM('user.name', '#nameInput', { twoWay: true });
 * unbind(); // Removes listeners
 */

export function createState(initialState) {
  const listeners = new Set();

  // Helper: returns true for non-null objects/arrays/Map
  const isObject = (val) => val && typeof val === "object";
  const isMap = (val) => val instanceof Map;

  // --- Core: Deep reactive Proxy ---
  function createDeepProxy(target, path = []) {
    if (isMap(target)) {
      // Proxy for Map
      return new Proxy(target, {
        get(obj, prop, receiver) {
          if (prop === "__isReactive") return true;
          if (prop === "asArray") {
            // Return array of [key, value] pairs
            return () => Array.from(obj.entries());
          }
          if (["set", "delete", "clear"].includes(prop)) {
            // Wrap mutating methods to notify listeners
            return function(...args) {
              let oldValue, key;
              if (prop === "set") {
                key = args[0];
                oldValue = obj.get(key);
                let value = args[1];
                if (isObject(value) && !value?.__isReactive) {
                  value = createDeepProxy(value, path.concat([key]));
                  args[1] = value;
                }
                const result = Map.prototype.set.apply(obj, args);
                listeners.forEach(fn =>
                  fn({
                    path: path.concat([key]),
                    newValue: obj.get(key),
                    oldValue,
                    prop: key,
                    root: proxy
                  })
                );
                return result;
              } else if (prop === "delete") {
                key = args[0];
                oldValue = obj.get(key);
                const result = Map.prototype.delete.apply(obj, args);
                listeners.forEach(fn =>
                  fn({
                    path: path.concat([key]),
                    newValue: undefined,
                    oldValue,
                    prop: key,
                    root: proxy
                  })
                );
                return result;
              } else if (prop === "clear") {
                const oldEntries = Array.from(obj.entries());
                const result = Map.prototype.clear.apply(obj, args);
                oldEntries.forEach(([key, oldValue]) => {
                  listeners.forEach(fn =>
                    fn({
                      path: path.concat([key]),
                      newValue: undefined,
                      oldValue,
                      prop: key,
                      root: proxy
                    })
                  );
                });
                return result;
              }
            };
          }
          // For get, has, etc.
          const value = Reflect.get(obj, prop, receiver);
          // Deep-proxy Map values on get
          if (typeof prop === "string" && obj.has(prop)) {
            const v = obj.get(prop);
            if (isObject(v) && !v?.__isReactive) {
              const proxied = createDeepProxy(v, path.concat([prop]));
              obj.set(prop, proxied);
              return proxied;
            }
          }
          return value;
        }
      });
    }
    // Proxy for objects/arrays
    return new Proxy(target, {
      set(obj, prop, value) {
        const oldValue = obj[prop];
        // Deep-proxy new object/array/Map values
        if (isObject(value) && !value?.__isReactive) {
          value = createDeepProxy(value, path.concat(prop));
        }
        obj[prop] = value;
        // Notify all listeners
        listeners.forEach(fn =>
          fn({
            path: path.concat(prop),
            newValue: value,
            oldValue,
            prop,
            root: proxy
          })
        );
        return true;
      },
      get(obj, prop) {
        if (prop === "__isReactive") return true;
        if (prop === "asArray") {
          // Return a function that returns a shallow copy of the underlying array if this is an array
          return () => Array.isArray(obj) ? Array.from(obj) : obj;
        }
        const value = obj[prop];
        // Lazy-proxy nested objects/arrays/Maps
        if (isObject(value) && !value?.__isReactive) {
          obj[prop] = createDeepProxy(value, path.concat(prop));
          return obj[prop];
        }
        return value;
      }
    });
  }

  // Wrap primitives in an object for consistent Proxying
  const root =
    initialState === null || typeof initialState !== "object"
      ? { value: initialState }
      : initialState;

  const proxy = createDeepProxy(root);

  // --- Subscription API ---
  /**
   * Subscribe to state changes.
   * @param {function(change)} fn - Called on any set, with {path, newValue, oldValue, prop, root}
   * @param {string|string[]} [path] - Optional. Subscribe only to changes at this path (dot string or array)
   * @returns {void}
   *
   * Example usage:
   *   // Subscribe to all changes
   *   state.subscribe(change => {
   *     console.log('Any change:', change.path.join('.'), change.newValue);
   *   });
   *
   *   // Subscribe to a specific property (string path)
   *   state.subscribe(change => {
   *     console.log('City changed:', change.newValue);
   *   }, 'user.profile.city');
   *
   *   // Subscribe to a specific property (array path)
   *   state.subscribe(change => {
   *     console.log('City changed:', change.newValue);
   *   }, ['user', 'profile', 'city']);
   *
   *   // Unsubscribe (works for both global and path-specific)
   *   state.unsubscribe(myCallback);
   */
  proxy.subscribe = (fn, path) => {
    if (path) {
      const pathArr = Array.isArray(path) ? path : path.split(".");
      const wrapped = (change) => {
        if (
          change.path.length === pathArr.length &&
          change.path.every((k, i) => k === pathArr[i])
        ) {
          fn(change);
        }
      };
      listeners.add(wrapped);
      fn._wrappedListener = wrapped;
    } else {
      listeners.add(fn);
    }
  };

  /**
   * Unsubscribe a listener.
   * @param {function(change)} fn
   */
  proxy.unsubscribe = (fn) => {
    listeners.delete(fn._wrappedListener || fn);
  };

  // --- Flexible DOM Binding API ---
  /**
   * Bind a state property to a DOM property or attribute (one-way or two-way).
   * 
   * @param {string|string[]} propertyPath - e.g. 'user.name' or ['user','name']
   * @param {string|Element} selectorOrElement - CSS selector or DOM element
   * @param {Object} options
   *   - {boolean} [twoWay=false]: If true, DOM updates state as well
   *   - {string} [eventType]: Which event to listen for (default: "input" for text, "change" for checkbox/select)
   *   - {string} [prop]: Property of element to bind (e.g. "value", "textContent", "innerHTML")
   *   - {string} [attr]: Attribute of element to bind (e.g. "data-user", "title")
   * @returns {Function} Call to unbind listeners
   */
  proxy.bindToDOM = function(propertyPath, selectorOrElement, options = {}) {
    const { twoWay = false, eventType, prop, attr } = options;
    // Accept dot, array, or string path
    const pathArr = Array.isArray(propertyPath)
      ? propertyPath
      : (typeof propertyPath === "string" ? propertyPath.split('.') : [propertyPath]);

    // Resolve DOM element
    let el =
      typeof selectorOrElement === "string"
        ? document.querySelector(selectorOrElement)
        : selectorOrElement;
    if (!el) {
      console.warn(`[createState] bindToDOM: Element not found for selector:`, selectorOrElement);
      return;
    }

    // Get/set nested property (supports Map)
    function getByPath(obj, path) {
      return path.reduce((o, key) => {
        if (isMap(o)) return o.get(key);
        return o ? o[key] : undefined;
      }, obj);
    }
    function setByPath(obj, path, value) {
      let o = obj;
      for (let i = 0; i < path.length - 1; i++) {
        o = isMap(o) ? o.get(path[i]) : o[path[i]];
      }
      if (isMap(o)) o.set(path[path.length - 1], value);
      else o[path[path.length - 1]] = value;
    }

    // --- DOM update logic ---
    function updateDOM() {
      let value = getByPath(proxy, pathArr);
      if (prop) {
        // Bind to any property (e.g. textContent, innerHTML)
        el[prop] = value ?? "";
      } else if (attr) {
        // Bind to any attribute
        if (value == null) el.removeAttribute(attr);
        else el.setAttribute(attr, value);
      } else if (el.type === "checkbox") {
        el.checked = !!value;
      } else if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT"
      ) {
        el.value = value ?? "";
      } else {
        el.textContent = value ?? "";
      }
    }

    updateDOM();

    // Only update if this specific property was changed
    const listener = (change) => {
      if (
        change.path.length === pathArr.length &&
        change.path.every((k, i) => k === pathArr[i])
      ) {
        updateDOM();
      }
    };
    proxy.subscribe(listener);

    // --- Two-way binding: DOM → state ---
    if (twoWay) {
      let readProp = prop;
      let evt =
        eventType ||
        (el.type === "checkbox"
          ? "change"
          : el.tagName === "SELECT"
          ? "change"
          : "input");
      const handler = (e) => {
        let val;
        if (attr) {
          val = el.getAttribute(attr);
        } else if (readProp) {
          val = el[readProp];
        } else if (el.type === "checkbox") {
          val = el.checked;
        } else {
          val = el.value;
        }
        setByPath(proxy, pathArr, val);
      };
      el.addEventListener(evt, handler);

      // Unbind both state and DOM listeners
      return () => {
        proxy.unsubscribe(listener);
        el.removeEventListener(evt, handler);
      };
    } else {
      return () => proxy.unsubscribe(listener);
    }
  };

  return proxy;
}

// Unwraps a state object or returns the value directly
export function unwrap(valOrState) {
  if (valOrState && typeof valOrState === 'object' && 'value' in valOrState) return valOrState.value;
  return valOrState;
}

/*
---------------------
----- EXAMPLES ------
---------------------

// 1. CREATE STATE
const state = createState({
  user: { name: "Alice", info: { city: "LA" } },
  checked: false,
  html: "<b>Hi</b>",
  settings: new Map([["theme", "light"], ["lang", "en"]])
});

// 2. GET/SET
state.user.name = "Bob";
state.user.info.city = "NY";
console.log(state.user.info.city);

// 3. MAP USAGE
state.settings.set("theme", "dark");
console.log(state.settings.get("theme"));
state.settings.set("profile", { city: "NY" });
state.settings.get("profile").city = "LA"; // Deep reactivity for Map values
state.settings.delete("lang");

// 4. SUBSCRIBE TO ALL CHANGES
state.subscribe(change => {
  console.log("Changed:", change.path.join("."), change.oldValue, "→", change.newValue);
});

// 5. DOM BINDING

// <input id="nameInput">   <span id="nameSpan"></span>
state.bindToDOM('user.name', '#nameInput', { twoWay: true });
state.bindToDOM('user.name', '#nameSpan', { prop: 'textContent' });

// <span id="themeDisplay"></span>
state.bindToDOM(['settings','theme'], '#themeDisplay', { prop: 'textContent' });

// <div id="profileBox"></div>
state.bindToDOM(['user','name'], '#profileBox', { attr: 'data-username' });

// <input type="checkbox" id="checkBox">
state.bindToDOM('checked', '#checkBox', { twoWay: true });

// <div id="htmlBox"></div>
state.bindToDOM('html', '#htmlBox', { prop: 'innerHTML' });

// 6. UNBINDING
const unbind = state.bindToDOM('user.name', '#nameInput', { twoWay: true });
unbind();

*/
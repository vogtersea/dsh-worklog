/**
 * Browser half of dsh-worklog.
 *
 * It contributes two seats the way the shell's own pages do: a row in the
 * sidebar's global panel list, and the page that row selects in the layout's
 * keyed main slot.
 *
 * The page embeds the plugin's OWN route (/worklog-plugin/app), served by the
 * host half. There is no second service: installing this plugin is the whole
 * installation.
 *
 * @module dsh-worklog/client
 */
window.__ModuleLoader__.load({
  id: "dsh-worklog",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");

    /** Panel id shared with the host half. */
    const PANEL_ID = "worklog-panel";
    /** Where this row sits among the shell's global panel rows. */
    const PANEL_ORDER = 30;
    /** The app the host half serves. */
    const APP_URL = "/worklog-plugin/app";
    /** Health route used to tell "starting" from "broken". */
    const HEALTH_URL = "/worklog-plugin/health";
    /** Label shown on the sidebar row and as the panel title. */
    const LABEL = "工作志";

    /**
     * The sidebar glyph; the shell owns the row box, label and active state.
     * @param props - square edge and selection state supplied by the shell.
     * @returns the decorative mark.
     */
    function WorklogPanelIcon(props) {
      const size = typeof props?.size === "number" ? props.size : 16;
      return react.createElement(
        "svg",
        {
          "data-dsh-panel-entry": PANEL_ID,
          viewBox: "0 0 16 16",
          width: size,
          height: size,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.3,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
        },
        react.createElement("rect", { x: 2.5, y: 1.5, width: 11, height: 13, rx: 1.6 }),
        react.createElement("path", { d: "M5 5.2h6M5 8h4.2M5 10.8h3" }),
        react.createElement("path", { d: "M9.4 10.4l1.5 1.5 2.1-2.6" })
      );
    }

    /**
     * The page: the plugin's own app in a frame, with a reload control so a
     * view never gets stuck on stale content.
     * @returns the panel element.
     */
    function WorklogPanel() {
      return react.createElement("iframe", {
        src: APP_URL,
        title: LABEL,
        style: { display: "block", width: "100%", height: "100%", border: "0", background: "transparent" },
      });
    }

    /**
     * Mount both seats.
     * @param ctx - client root context; only slots is used.
     * @returns a disposer.
     */
    function apply(ctx) {
      const disposers = [];
      try {
        const slots = ctx && ctx.slots;
        if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return;

        disposers.push(
          slots.inject("sidebar.panellist", () =>
            slots.register(
              { name: "sidebar.panellist", id: PANEL_ID, order: PANEL_ORDER, label: () => LABEL },
              WorklogPanelIcon
            )
          )
        );

        disposers.push(
          slots.inject("main", () => slots.register({ name: "main", key: PANEL_ID }, WorklogPanel))
        );
      } catch {
        /* a shell that cannot serve the seats leaves the panel absent */
      }
      return () => {
        for (const dispose of disposers.splice(0)) {
          try { dispose() } catch { /* already disposed */ }
        }
      };
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    exports.PANEL_ID = PANEL_ID;
    exports.APP_URL = APP_URL;
    return module.exports;
  },
});

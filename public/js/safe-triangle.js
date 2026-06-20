/**
 * Safe triangle hover menus for Spotter.
 *
 * Prevents dropdowns from closing when the pointer crosses the gap between a
 * trigger and its panel. Uses an invisible SVG triangle (the "safe triangle"
 * / "safe area" pattern) so users can move diagonally without the menu
 * disappearing.
 *
 * Markup:
 *   <div data-safe-menu>
 *     <button data-safe-menu-trigger aria-haspopup="true">...</button>
 *     <div data-safe-menu-panel role="menu">...</div>
 *   </div>
 *
 * Nested submenus (optional):
 *   <div data-safe-submenu>
 *     <button data-safe-submenu-trigger>...</button>
 *     <div data-safe-submenu-panel role="menu">...</div>
 *   </div>
 */
if (typeof window.SpotterSafeTriangle === "undefined") {
  const HOVER_CAPABLE =
  window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
  !("ontouchstart" in window || navigator.maxTouchPoints > 0);

  const pointInRect = (x, y, rect) =>
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom;

  const getPlacement = (anchorRect, panelRect) => {
    const anchorCx = (anchorRect.left + anchorRect.right) / 2;
    const anchorCy = (anchorRect.top + anchorRect.bottom) / 2;
    const panelCx = (panelRect.left + panelRect.right) / 2;
    const panelCy = (panelRect.top + panelRect.bottom) / 2;
    const dx = panelCx - anchorCx;
    const dy = panelCy - anchorCy;

    if (Math.abs(dy) > Math.abs(dx)) {
      return dy > 0 ? "bottom" : "top";
    }
    return dx > 0 ? "right" : "left";
  };

  const getPanelEdge = (panelRect, placement) => {
    switch (placement) {
      case "bottom":
        return [
          [panelRect.left, panelRect.top],
          [panelRect.right, panelRect.top],
        ];
      case "top":
        return [
          [panelRect.left, panelRect.bottom],
          [panelRect.right, panelRect.bottom],
        ];
      case "right":
        return [
          [panelRect.left, panelRect.top],
          [panelRect.left, panelRect.bottom],
        ];
      case "left":
        return [
          [panelRect.right, panelRect.top],
          [panelRect.right, panelRect.bottom],
        ];
      default:
        return [
          [panelRect.left, panelRect.top],
          [panelRect.right, panelRect.top],
        ];
    }
  };

  class SafeTriangleOverlay {
    constructor() {
      this.svg = null;
      this.path = null;
      this.onEnter = null;
      this.onLeave = null;
    }

    ensureMounted() {
      if (this.svg) return;
      this.svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      this.svg.setAttribute("class", "safe-triangle-overlay");
      this.svg.setAttribute("aria-hidden", "true");
      this.path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      this.path.setAttribute("class", "safe-triangle-path");
      this.path.addEventListener("mouseenter", () => this.onEnter?.());
      this.path.addEventListener("mouseleave", () => this.onLeave?.());
      document.body.appendChild(this.svg);
    }

    show(mouseX, mouseY, anchorRect, panelRect) {
      this.ensureMounted();
      const placement = getPlacement(anchorRect, panelRect);
      const [[x2, y2], [x3, y3]] = getPanelEdge(
        panelRect,
        placement,
      );
      const x1 = mouseX;
      const y1 = mouseY;

      const minX = Math.min(x1, x2, x3);
      const minY = Math.min(y1, y2, y3);
      const maxX = Math.max(x1, x2, x3);
      const maxY = Math.max(y1, y2, y3);
      const width = Math.max(maxX - minX, 1);
      const height = Math.max(maxY - minY, 1);

      this.svg.style.left = `${minX}px`;
      this.svg.style.top = `${minY}px`;
      this.svg.style.width = `${width}px`;
      this.svg.style.height = `${height}px`;
      this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      this.path.setAttribute(
        "d",
        `M ${x1 - minX},${y1 - minY} L ${x2 - minX},${y2 - minY} L ${x3 - minX},${y3 - minY} Z`,
      );

      if (!this.path.parentNode) {
        this.svg.appendChild(this.path);
      }

      return { apex: [x1, y1], base: [[x2, y2], [x3, y3]] };
    }

    hide() {
      this.path?.remove();
    }

    destroy() {
      this.hide();
      this.svg?.remove();
      this.svg = null;
      this.path = null;
    }
  }

  class SafeMenuPair {
    constructor({ anchor, panel, openClass = "open", onOpen, onClose }) {
      this.anchor = anchor;
      this.panel = panel;
      this.openClass = openClass;
      this.onOpen = onOpen;
      this.onClose = onClose;
      this.overlay = new SafeTriangleOverlay();
      this.overlay.onEnter = () => {
        this.pointerOnPath = true;
        this.cancelClose();
      };
      this.overlay.onLeave = () => {
        this.pointerOnPath = false;
        this.scheduleClose();
      };
      this.closeTimer = null;
      this.mouse = { x: 0, y: 0 };
      this.pointerOnPath = false;

      this.onMouseMove = this.onMouseMove.bind(this);
      this.onDocumentClick = this.onDocumentClick.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
    }

    get isOpen() {
      return this.panel.classList.contains(this.openClass);
    }

    open() {
      if (this.isOpen) return;
      this.panel.classList.add(this.openClass);
      this.anchor.setAttribute("aria-expanded", "true");
      this.onOpen?.();
      document.addEventListener("mousemove", this.onMouseMove);
      document.addEventListener("keydown", this.onKeyDown);
      document.addEventListener("click", this.onDocumentClick, true);
    }

    close() {
      if (!this.isOpen) return;
      this.panel.classList.remove(this.openClass);
      this.anchor.setAttribute("aria-expanded", "false");
      this.overlay.hide();
      this.pointerOnPath = false;
      this.onClose?.();
      document.removeEventListener("mousemove", this.onMouseMove);
      document.removeEventListener("keydown", this.onKeyDown);
      document.removeEventListener("click", this.onDocumentClick, true);
    }

    scheduleClose(delay = 120) {
      this.cancelClose();
      this.closeTimer = setTimeout(() => this.close(), delay);
    }

    cancelClose() {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    pointerInSafeZone() {
      const anchorRect = this.anchor.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();

      if (pointInRect(this.mouse.x, this.mouse.y, anchorRect)) {
        this.overlay.hide();
        this.pointerOnPath = false;
        return true;
      }

      if (this.isOpen && pointInRect(this.mouse.x, this.mouse.y, panelRect)) {
        this.overlay.hide();
        this.pointerOnPath = false;
        return true;
      }

      if (this.pointerOnPath) {
        return true;
      }

      return false;
    }

    onMouseMove(e) {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (!this.isOpen) return;

      if (this.pointerInSafeZone()) {
        this.cancelClose();
        return;
      }

      const anchorRect = this.anchor.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();
      this.overlay.show(e.clientX, e.clientY, anchorRect, panelRect);
      this.cancelClose();
    }

    onKeyDown(e) {
      if (e.key === "Escape" && this.isOpen) {
        e.preventDefault();
        this.close();
        this.anchor.focus();
      }
    }

    onDocumentClick(e) {
      if (
        this.anchor.contains(e.target) ||
        this.panel.contains(e.target)
      ) {
        return;
      }
      this.close();
    }

    bindHover() {
      this.anchor.addEventListener("mouseenter", () => {
        this.cancelClose();
        this.open();
      });

      this.anchor.addEventListener("mouseleave", () => {
        if (!this.pointerInSafeZone()) {
          this.scheduleClose();
        }
      });

      this.panel.addEventListener("mouseenter", () => {
        this.cancelClose();
        this.overlay.hide();
        this.pointerOnPath = false;
      });

      this.panel.addEventListener("mouseleave", () => {
        this.scheduleClose();
      });
    }

    bindClick() {
      this.anchor.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.isOpen) {
          this.close();
        } else {
          this.open();
        }
      });
    }

    destroy() {
      this.cancelClose();
      this.close();
      this.overlay.destroy();
      document.removeEventListener("click", this.onDocumentClick, true);
      document.removeEventListener("mousemove", this.onMouseMove);
      document.removeEventListener("keydown", this.onKeyDown);
    }
  }

  class SafeMenu {
    constructor(root) {
      this.root = root;
      this.trigger = root.querySelector("[data-safe-menu-trigger]");
      this.panel = root.querySelector("[data-safe-menu-panel]");
      this.pairs = [];

      if (!this.trigger || !this.panel) return;

      this.trigger.setAttribute("aria-haspopup", "true");
      this.trigger.setAttribute("aria-expanded", "false");

      const mainPair = new SafeMenuPair({
        anchor: this.trigger,
        panel: this.panel,
        openClass: root.dataset.safeMenuOpenClass || "open",
      });

      if (HOVER_CAPABLE) {
        mainPair.bindHover();
      } else {
        mainPair.bindClick();
      }

      this.pairs.push(mainPair);

      root.querySelectorAll("[data-safe-submenu]").forEach((submenu) => {
        const subTrigger = submenu.querySelector("[data-safe-submenu-trigger]");
        const subPanel = submenu.querySelector("[data-safe-submenu-panel]");
        if (!subTrigger || !subPanel) return;

        subTrigger.setAttribute("aria-haspopup", "true");
        subTrigger.setAttribute("aria-expanded", "false");

        const pair = new SafeMenuPair({
          anchor: subTrigger,
          panel: subPanel,
          openClass: submenu.dataset.safeMenuOpenClass || "open",
        });

        if (HOVER_CAPABLE) {
          pair.bindHover();
        } else {
          pair.bindClick();
        }

        this.pairs.push(pair);
      });
    }

    destroy() {
      this.pairs.forEach((pair) => pair.destroy());
      this.pairs = [];
    }
  }

  const instances = new WeakMap();

  window.SpotterSafeTriangle = {
    HOVER_CAPABLE,

    init(root = document) {
      root.querySelectorAll("[data-safe-menu]").forEach((el) => {
        if (instances.has(el)) return;
        const instance = new SafeMenu(el);
        if (instance.pairs.length) {
          instances.set(el, instance);
        }
      });
    },

    destroy(root) {
      const instance = instances.get(root);
      if (!instance) return;
      instance.destroy();
      instances.delete(root);
    },
  };

  const boot = () => window.SpotterSafeTriangle.init();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}

import styles from "./style.css?inline";

interface Position {
  x: number;
  y: number;
}
interface DragStart extends Position {
  initialX: number;
  initialY: number;
}

type DockState = "undocked" | "left" | "right" | "bottom";

/** Injects a page-scope script from your extension. */
function injectScript(path: string): void {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL(path);
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
}

/** Load saved position or default to bottom-right. */
async function getStoredPosition(): Promise<Position> {
  return new Promise((resolve) =>
    chrome.storage.local.get("buttonPosition", (result) => {
      const pos = result.buttonPosition;
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        resolve(pos);
      } else {
        resolve({
          x: window.innerWidth - 80,
          y: window.innerHeight - 80,
        });
      }
    }),
  );
}

/** Persist the floating-button position. */
function savePosition(pos: Position): Promise<void> {
  return chrome.storage.local.set({ buttonPosition: pos });
}

/** Builds and wires up the draggable button + modal. */
export async function initializeFloatingButton(root: ShadowRoot) {
  const position = await getStoredPosition();
  let isDragging = false;
  let didMove = false;
  let dragStart!: DragStart;
  const CLICK_THRESHOLD = 5; // px

  let modalDragStart!: DragStart;
  let isModalDragging = false;
  let modalPos = { x: 0, y: 0 };
  let dockState: DockState = "undocked";

  // Create button
  const btn = document.createElement("button");
  btn.className = "sfdc-companion-button";
  Object.assign(btn.style, {
    position: "fixed",
    left: `${position.x}px`,
    top: `${position.y}px`,
    backgroundImage: `url(${chrome.runtime.getURL("logo.png")})`,
    backgroundSize: "cover",
    zIndex: "9999",
    cursor: "pointer",
  });

  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.className = "sfdc-companion-modal-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = /* html */ `
    <div class="sfdc-companion-modal-content">
      <div class="sfdc-companion-modal-header">
        <div class="dock-buttons">
          <button class="dock-btn" data-dock="left" title="Dock left">\u2B05</button>
          <button class="dock-btn" data-dock="bottom" title="Dock bottom">\u2B07</button>
          <button class="dock-btn" data-dock="right" title="Dock right">\u27A1</button>
          <button class="dock-btn" data-dock="undocked" title="Undock">\u26F6</button>
        </div>
        <button class="close-btn">&times;</button>
      </div>
      <main class="sfdc-companion-modal-body">
        <iframe allow="clipboard-read; clipboard-write"
                src="${chrome.runtime.getURL("index.html")}"></iframe>
      </main>
    </div>
  `;

  root.append(btn, overlay);

  const modalContent = overlay.querySelector<HTMLDivElement>(
    ".sfdc-companion-modal-content",
  )!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>(".close-btn")!;
  const dockButtons = Array.from(
    overlay.querySelectorAll<HTMLButtonElement>(".dock-btn"),
  );
  const modalHeader = overlay.querySelector<HTMLDivElement>(
    ".sfdc-companion-modal-header",
  )!;

  function applyDock() {
    modalContent.classList.remove("dock-left", "dock-right", "dock-bottom");
    overlay.classList.toggle("docked", dockState !== "undocked");
    if (dockState === "left") {
      modalContent.classList.add("dock-left");
    } else if (dockState === "right") {
      modalContent.classList.add("dock-right");
    } else if (dockState === "bottom") {
      modalContent.classList.add("dock-bottom");
    } else {
      Object.assign(modalContent.style, {
        left: `${modalPos.x}px`,
        top: `${modalPos.y}px`,
      });
    }
    for (const btn of dockButtons) {
      btn.classList.toggle("active", btn.dataset.dock === dockState);
    }
  }

  const openModal = () => {
    overlay.style.display = "flex";
    dockState = "undocked";
    modalPos = {
      x: (window.innerWidth - modalContent.offsetWidth) / 2,
      y: (window.innerHeight - modalContent.offsetHeight) / 2,
    };
    applyDock();
  };
  const closeModal = () => {
    overlay.style.display = "none";
  };

  // Pointer down: begin drag
  btn.addEventListener("pointerdown", (e) => {
    isDragging = true;
    didMove = false;
    dragStart = {
      x: e.clientX,
      y: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
    btn.setPointerCapture(e.pointerId);
  });

  // Pointer move: update position if moved beyond threshold
  btn.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.hypot(dx, dy) > CLICK_THRESHOLD) {
      didMove = true;
      position.x = Math.min(
        window.innerWidth - btn.offsetWidth,
        Math.max(0, dragStart.initialX + dx),
      );
      position.y = Math.min(
        window.innerHeight - btn.offsetHeight,
        Math.max(0, dragStart.initialY + dy),
      );
      btn.style.left = `${position.x}px`;
      btn.style.top = `${position.y}px`;
    }
  });

  // Pointer up: end drag, persist, and open only if not moved
  btn.addEventListener("pointerup", async (e) => {
    btn.releasePointerCapture(e.pointerId);
    isDragging = false;
    await savePosition(position);
    if (!didMove) openModal();
  });

  // ===== Modal dragging =====
  modalHeader.addEventListener("pointerdown", (e) => {
    if (dockState !== "undocked") return;
    if ((e.target as HTMLElement).closest(".dock-btn")) return;
    isModalDragging = true;
    modalDragStart = {
      x: e.clientX,
      y: e.clientY,
      initialX: modalPos.x,
      initialY: modalPos.y,
    };
    modalHeader.setPointerCapture(e.pointerId);
  });

  modalHeader.addEventListener("pointermove", (e) => {
    if (!isModalDragging || dockState !== "undocked") return;
    const dx = e.clientX - modalDragStart.x;
    const dy = e.clientY - modalDragStart.y;
    modalPos.x = modalDragStart.initialX + dx;
    modalPos.y = modalDragStart.initialY + dy;
    modalContent.style.left = `${modalPos.x}px`;
    modalContent.style.top = `${modalPos.y}px`;
  });

  modalHeader.addEventListener("pointerup", (e) => {
    if (!isModalDragging) return;
    modalHeader.releasePointerCapture(e.pointerId);
    isModalDragging = false;
  });

  // Docking via buttons
  for (const btn of dockButtons) {
    btn.addEventListener("click", () => {
      dockState = btn.dataset.dock as DockState;
      applyDock();
    });
  }

  // Modal close handlers
  closeBtn.addEventListener("click", closeModal);

  // Window resize: keep button in view
  window.addEventListener("resize", () => {
    position.x = Math.min(window.innerWidth - btn.offsetWidth, position.x);
    position.y = Math.min(window.innerHeight - btn.offsetHeight, position.y);
    btn.style.left = `${position.x}px`;
    btn.style.top = `${position.y}px`;
    if (dockState === "undocked") {
      modalPos.x = Math.min(
        window.innerWidth - modalContent.offsetWidth,
        Math.max(0, modalPos.x),
      );
      modalPos.y = Math.min(
        window.innerHeight - modalContent.offsetHeight,
        Math.max(0, modalPos.y),
      );
      modalContent.style.left = `${modalPos.x}px`;
      modalContent.style.top = `${modalPos.y}px`;
    }
  });
}

/** ======== Bootstrap ======== */
(async () => {
  injectScript("public/inject.js");

  const host = document.createElement("div");
  host.id = "salesforce-devtools-companion-host";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  await initializeFloatingButton(shadow);

  // Relay start/complete messages to background
  window.addEventListener("message", async ({ source, data }) => {
    if (source !== window) return;
    const { type, payload } = data;
    const resp = await chrome.runtime.sendMessage({ type, payload });
    if (resp.status === "error") {
      console.error(`Extension background error [${type}]:`, resp.message);
    }
  });
})();

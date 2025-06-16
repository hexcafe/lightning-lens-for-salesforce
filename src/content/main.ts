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

const dockIcons = {
  left:
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>',
  bottom:
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg>',
  right:
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>',
  undocked:
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>',
} as const;

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

interface ModalState {
  dockState: DockState;
  modalPos: Position;
  undockedSize: { width: number; height: number };
  dockWidth: number;
  dockHeight: number;
}

async function getStoredModalState(): Promise<ModalState | null> {
  return new Promise((resolve) =>
    chrome.storage.local.get("modalState", (res) => {
      const s = res.modalState as ModalState | undefined;
      if (
        s &&
        s.modalPos &&
        typeof s.modalPos.x === "number" &&
        typeof s.modalPos.y === "number"
      ) {
        resolve(s);
      } else {
        resolve(null);
      }
    }),
  );
}

function saveModalState(state: ModalState): Promise<void> {
  return chrome.storage.local.set({ modalState: state });
}

/** Builds and wires up the draggable button + modal. */
export async function initializeFloatingButton(root: ShadowRoot) {
  const position = await getStoredPosition();
  const storedModalState = await getStoredModalState();
  let isDragging = false;
  let didMove = false;
  let dragStart!: DragStart;
  const CLICK_THRESHOLD = 5; // px

  let modalDragStart!: DragStart;
  let isModalDragging = false;
  let modalPos =
    storedModalState?.modalPos ?? {
      x: (window.innerWidth - Math.round(window.innerWidth * 0.8)) / 2,
      y: (window.innerHeight - Math.round(window.innerHeight * 0.8)) / 2,
    };
  let dockState: DockState = storedModalState?.dockState ?? "undocked";
  let undockedSize =
    storedModalState?.undockedSize ?? {
      width: Math.round(window.innerWidth * 0.8),
      height: Math.round(window.innerHeight * 0.8),
    };
  let dockWidth = storedModalState?.dockWidth ?? 360;
  let dockHeight = storedModalState?.dockHeight ?? Math.round(window.innerHeight * 0.4);
  let isResizing = false;
  let resizeStart!: { x: number; y: number; width: number; height: number };

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
          <button class="dock-btn" data-dock="left" title="Dock left">${dockIcons.left}</button>
          <button class="dock-btn" data-dock="bottom" title="Dock bottom">${dockIcons.bottom}</button>
          <button class="dock-btn" data-dock="right" title="Dock right">${dockIcons.right}</button>
          <button class="dock-btn" data-dock="undocked" title="Undock">${dockIcons.undocked}</button>
        </div>
        <button class="close-btn">&times;</button>
      </div>
      <main class="sfdc-companion-modal-body">
        <iframe allow="clipboard-read; clipboard-write"
                src="${chrome.runtime.getURL("index.html")}"></iframe>
      </main>
      <div class="resize-handle"></div>
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
  const resizeHandle = overlay.querySelector<HTMLDivElement>(
    ".resize-handle",
  )!;

  function applyDock() {
    modalContent.classList.remove("dock-left", "dock-right", "dock-bottom");
    if (dockState === "left") {
      modalContent.classList.add("dock-left");
      modalContent.style.width = `${dockWidth}px`;
      modalContent.style.height = "100vh";
      modalContent.style.left = "";
      modalContent.style.top = "";
      modalContent.style.maxWidth = "";
    } else if (dockState === "right") {
      modalContent.classList.add("dock-right");
      modalContent.style.width = `${dockWidth}px`;
      modalContent.style.height = "100vh";
      modalContent.style.left = "";
      modalContent.style.top = "";
      modalContent.style.maxWidth = "";
    } else if (dockState === "bottom") {
      modalContent.classList.add("dock-bottom");
      modalContent.style.width = "100vw";
      modalContent.style.height = `${dockHeight}px`;
      modalContent.style.left = "";
      modalContent.style.top = "";
      modalContent.style.maxWidth = "none";
    } else {
      modalContent.style.width = `${undockedSize.width}px`;
      modalContent.style.height = `${undockedSize.height}px`;
      modalContent.style.left = `${modalPos.x}px`;
      modalContent.style.top = `${modalPos.y}px`;
      modalContent.style.maxWidth = "1200px";
    }
    for (const btn of dockButtons) {
      btn.classList.toggle("active", btn.dataset.dock === dockState);
    }
  }

  const openModal = () => {
    overlay.style.display = "block";
    applyDock();
  };
  const closeModal = () => {
    overlay.style.display = "none";
    void saveModalState({
      dockState,
      modalPos,
      undockedSize,
      dockWidth,
      dockHeight,
    });
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
    const target = e.target as HTMLElement;
    if (target.closest(".dock-btn") || target.closest(".close-btn")) return;
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
    void saveModalState({
      dockState,
      modalPos,
      undockedSize,
      dockWidth,
      dockHeight,
    });
  });

  // ===== Modal resizing =====
  resizeHandle.addEventListener("pointerdown", (e) => {
    isResizing = true;
    resizeStart = {
      x: e.clientX,
      y: e.clientY,
      width: modalContent.offsetWidth,
      height: modalContent.offsetHeight,
    };
    resizeHandle.setPointerCapture(e.pointerId);
  });

  resizeHandle.addEventListener("pointermove", (e) => {
    if (!isResizing) return;
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    if (dockState === "left") {
      dockWidth = Math.max(200, resizeStart.width + dx);
      modalContent.style.width = `${dockWidth}px`;
    } else if (dockState === "right") {
      dockWidth = Math.max(200, resizeStart.width - dx);
      modalContent.style.width = `${dockWidth}px`;
    } else if (dockState === "bottom") {
      dockHeight = Math.max(100, resizeStart.height - dy);
      modalContent.style.height = `${dockHeight}px`;
    } else {
      undockedSize.width = Math.max(200, resizeStart.width + dx);
      undockedSize.height = Math.max(100, resizeStart.height + dy);
      modalContent.style.width = `${undockedSize.width}px`;
      modalContent.style.height = `${undockedSize.height}px`;
    }
  });

  resizeHandle.addEventListener("pointerup", (e) => {
    if (!isResizing) return;
    resizeHandle.releasePointerCapture(e.pointerId);
    isResizing = false;
    void saveModalState({
      dockState,
      modalPos,
      undockedSize,
      dockWidth,
      dockHeight,
    });
  });

  // Docking via buttons
  for (const btn of dockButtons) {
    btn.addEventListener("click", () => {
      dockState = btn.dataset.dock as DockState;
      applyDock();
      void saveModalState({
        dockState,
        modalPos,
        undockedSize,
        dockWidth,
        dockHeight,
      });
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
        window.innerWidth - undockedSize.width,
        Math.max(0, modalPos.x),
      );
      modalPos.y = Math.min(
        window.innerHeight - undockedSize.height,
        Math.max(0, modalPos.y),
      );
      modalContent.style.left = `${modalPos.x}px`;
      modalContent.style.top = `${modalPos.y}px`;
    } else if (dockState === "left" || dockState === "right") {
      dockWidth = Math.min(dockWidth, window.innerWidth - 50);
      modalContent.style.width = `${dockWidth}px`;
    } else if (dockState === "bottom") {
      dockHeight = Math.min(dockHeight, window.innerHeight - 50);
      modalContent.style.height = `${dockHeight}px`;
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

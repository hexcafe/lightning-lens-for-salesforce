import styles from "./style.css?inline";

interface Position {
  x: number;
  y: number;
}
interface DragStart extends Position {
  initialX: number;
  initialY: number;
}

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
      <button class="close-btn">&times;</button>
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

  const openModal = () => {
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
  };
  const closeModal = () => {
    overlay.style.display = "none";
    document.body.style.overflow = "";
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

  // Modal close handlers
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);
  modalContent.addEventListener("click", (e) => e.stopPropagation());

  // Window resize: keep button in view
  window.addEventListener("resize", () => {
    position.x = Math.min(window.innerWidth - btn.offsetWidth, position.x);
    position.y = Math.min(window.innerHeight - btn.offsetHeight, position.y);
    btn.style.left = `${position.x}px`;
    btn.style.top = `${position.y}px`;
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

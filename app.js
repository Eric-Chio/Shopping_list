const weeklyStorageKey = "shoppingChecklistWeeklyItems";
const legacyStorageKey = "shoppingChecklistItems";
const catalogTableName = "items";

const authSection = document.querySelector("#authSection");
const authForm = document.querySelector("#authForm");
const authEmailInput = document.querySelector("#authEmail");
const authPasswordInput = document.querySelector("#authPassword");
const loginButton = document.querySelector("#loginButton");
const signUpButton = document.querySelector("#signUpButton");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");
const appShell = document.querySelector("#appShell");
const form = document.querySelector("#itemForm");
const showItemFormButton = document.querySelector("#showItemForm");
const itemBarcodeInput = document.querySelector("#itemBarcode");
const itemNameInput = document.querySelector("#itemName");
const itemPriceInput = document.querySelector("#itemPrice");
const itemDiscountPriceInput = document.querySelector("#itemDiscountPrice");
const itemQuantityInput = document.querySelector("#itemQuantity");
const submitButton = document.querySelector("#submitButton");
const cancelEditButton = document.querySelector("#cancelEdit");
const itemList = document.querySelector("#itemList");
const totalPrice = document.querySelector("#totalPrice");
const emptyState = document.querySelector("#emptyState");
const clearSelectedButton = document.querySelector("#clearSelected");
const statusFilter = document.querySelector("#statusFilter");
const startScanButton = document.querySelector("#startScan");
const stopScanButton = document.querySelector("#stopScan");
const scannerArea = document.querySelector("#scanner");
const scannerStatus = document.querySelector("#scannerStatus");

const supabaseConfig = globalThis.SHOPPING_LIST_SUPABASE || {};
const isSupabaseConfigured =
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  !supabaseConfig.url.includes("YOUR_PROJECT_REF") &&
  !supabaseConfig.anonKey.includes("YOUR_SUPABASE_ANON_KEY");
const supabaseClient =
  globalThis.supabase && isSupabaseConfigured
    ? globalThis.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

let weeklyItems = loadWeeklyItems();
let editingItemId = null;
let recentlyScannedItemId = null;
let html5QrCode = null;
let isScanning = false;
let isHandlingScan = false;
let currentSession = null;

function loadWeeklyItems() {
  const savedItems = localStorage.getItem(weeklyStorageKey) || localStorage.getItem(legacyStorageKey);

  if (!savedItems) {
    return [];
  }

  try {
    const parsedItems = JSON.parse(savedItems);
    return Array.isArray(parsedItems) ? parsedItems.map(normalizeWeeklyItem).filter((item) => item.barcode) : [];
  } catch {
    return [];
  }
}

function normalizeWeeklyItem(item) {
  const normalPrice = Number.isFinite(item.normalPrice)
    ? item.normalPrice
    : Number.isFinite(item.price)
      ? item.price
      : 0;
  const discountPrice = Number.isFinite(item.discountPrice) ? item.discountPrice : null;
  const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;

  return {
    id: item.id || createItemId(),
    barcode: item.barcode || "",
    name: item.name || item.barcode || "",
    normalPrice,
    discountPrice,
    quantity: Math.min(quantity, 10),
    selected: Boolean(item.selected),
    updatedAt: item.updatedAt || item.updated_at || "",
  };
}

function saveWeeklyItems() {
  const localWeeklyState = weeklyItems.map((item) => ({
    barcode: item.barcode,
    selected: item.selected,
    quantity: item.quantity,
    discountPrice: item.discountPrice,
  }));

  localStorage.setItem(weeklyStorageKey, JSON.stringify(localWeeklyState));
}

function createItemId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBarcode(barcode) {
  return barcode.trim();
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

function getActivePrice(item) {
  return Number.isFinite(item.discountPrice) ? item.discountPrice : item.normalPrice;
}

function calculateTotal() {
  return weeklyItems
    .filter((item) => item.selected)
    .reduce((sum, item) => sum + getActivePrice(item) * item.quantity, 0);
}

function getVisibleItems() {
  return weeklyItems.filter((item) => {
    return (
      statusFilter.value === "all" ||
      (statusFilter.value === "selected" && item.selected) ||
      (statusFilter.value === "unselected" && !item.selected)
    );
  });
}

function setStatus(message) {
  scannerStatus.textContent = message;
}

function setAuthStatus(message) {
  authStatus.textContent = message;
}

function setAuthLoading(isLoading) {
  loginButton.disabled = isLoading;
  signUpButton.disabled = isLoading;
  logoutButton.disabled = isLoading;
}

function showLoggedInState(session) {
  currentSession = session;
  authSection.hidden = true;
  appShell.hidden = false;
  setAuthStatus("");
}

function showLoggedOutState(message = "") {
  currentSession = null;
  appShell.hidden = true;
  authSection.hidden = false;
  setAuthStatus(message);
  stopScanner();
}

async function loadSession() {
  if (!supabaseClient) {
    showLoggedOutState("Add your Supabase URL and anon key in supabase-config.js before logging in.");
    return;
  }

  setAuthStatus("Checking session...");

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showLoggedOutState(error.message || "Could not check your session.");
    return;
  }

  if (data.session) {
    showLoggedInState(data.session);
    await refreshWeeklyItemsFromSupabase();
  } else {
    showLoggedOutState();
  }
}

async function loginWithPassword() {
  if (!supabaseClient) {
    showLoggedOutState("Supabase is not configured yet.");
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    setAuthStatus("Enter your email and password.");
    return;
  }

  setAuthLoading(true);
  setAuthStatus("Logging in...");

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  setAuthLoading(false);

  if (error) {
    setAuthStatus(error.message || "Login failed.");
    return;
  }

  showLoggedInState(data.session);
  await refreshWeeklyItemsFromSupabase();
}

async function signUpWithPassword() {
  if (!supabaseClient) {
    showLoggedOutState("Supabase is not configured yet.");
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    setAuthStatus("Enter your email and password.");
    return;
  }

  setAuthLoading(true);
  setAuthStatus("Creating account...");

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  setAuthLoading(false);

  if (error) {
    setAuthStatus(error.message || "Sign up failed.");
    return;
  }

  if (data.session) {
    showLoggedInState(data.session);
    await refreshWeeklyItemsFromSupabase();
    return;
  }

  setAuthStatus("Account created. Check your email to confirm, then log in.");
}

async function logout() {
  if (!supabaseClient) {
    showLoggedOutState();
    return;
  }

  setAuthLoading(true);
  await supabaseClient.auth.signOut();
  setAuthLoading(false);
  resetForm();
  hideItemForm();
  showLoggedOutState("Logged out.");
}

function resetForm() {
  form.reset();
  itemQuantityInput.value = "1";
  editingItemId = null;
  submitButton.textContent = "Add item";
  setStatus("Use manual barcode input or scan with the camera.");
}

function showItemForm() {
  form.hidden = false;
  showItemFormButton.hidden = true;
}

function hideItemForm() {
  form.hidden = true;
  showItemFormButton.hidden = false;
  stopScanner();
}

function findWeeklyItemByBarcode(barcode) {
  const normalizedBarcode = normalizeBarcode(barcode);
  return weeklyItems.find((item) => item.barcode === normalizedBarcode) || null;
}

function startEditing(item) {
  showItemForm();
  editingItemId = item.id;
  itemBarcodeInput.value = item.barcode;
  itemNameInput.value = item.name;
  itemPriceInput.value = item.normalPrice.toFixed(2);
  itemDiscountPriceInput.value = Number.isFinite(item.discountPrice) ? item.discountPrice.toFixed(2) : "";
  itemQuantityInput.value = item.quantity;
  submitButton.textContent = "Save item";
  itemNameInput.focus();
  renderItems();
}

function catalogRowToWeeklyItem(row, existingItem = null) {
  return {
    id: existingItem?.id || createItemId(),
    barcode: row.barcode,
    name: row.name,
    normalPrice: Number(row.normal_price) || 0,
    discountPrice: existingItem?.discountPrice ?? null,
    quantity: existingItem?.quantity || 1,
    selected: existingItem?.selected ?? true,
    updatedAt: row.updated_at || "",
  };
}

async function findCatalogItemByBarcode(barcode) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured. Add your URL and anon key in supabase-config.js.");
  }

  if (!currentSession) {
    throw new Error("Log in before searching items.");
  }

  const { data, error } = await supabaseClient
    .from(catalogTableName)
    .select("barcode,name,normal_price,updated_at")
    .eq("barcode", barcode)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function refreshWeeklyItemsFromSupabase() {
  const barcodes = [...new Set(weeklyItems.map((item) => item.barcode).filter(Boolean))];

  if (!supabaseClient || !currentSession || barcodes.length === 0) {
    return;
  }

  setStatus("Loading latest normal prices from Supabase...");

  const { data, error } = await supabaseClient
    .from(catalogTableName)
    .select("barcode,name,normal_price,updated_at")
    .in("barcode", barcodes);

  if (error) {
    setStatus(error.message || "Could not load latest Supabase prices.");
    return;
  }

  const catalogItems = new Map((data || []).map((item) => [item.barcode, item]));

  weeklyItems = weeklyItems.map((item) => {
    const catalogItem = catalogItems.get(item.barcode);

    if (!catalogItem) {
      return item;
    }

    return {
      ...item,
      name: catalogItem.name,
      normalPrice: Number(catalogItem.normal_price) || 0,
      updatedAt: catalogItem.updated_at || "",
    };
  });

  renderItems();
  setStatus("Latest normal prices loaded from Supabase.");
}

async function saveCatalogItem({ barcode, name, normalPrice }) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured. Add your URL and anon key in supabase-config.js.");
  }

  if (!currentSession) {
    throw new Error("Log in before saving items.");
  }

  const { data, error } = await supabaseClient
    .from(catalogTableName)
    .upsert(
      {
        barcode,
        name,
        normal_price: normalPrice,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "barcode" }
    )
    .select("barcode,name,normal_price,updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function addOrUpdateWeeklyItem(item) {
  const index = weeklyItems.findIndex((savedItem) => savedItem.id === item.id || savedItem.barcode === item.barcode);

  if (index >= 0) {
    weeklyItems[index] = {
      ...weeklyItems[index],
      ...item,
      id: weeklyItems[index].id,
    };
    recentlyScannedItemId = weeklyItems[index].id;
  } else {
    weeklyItems.push(item);
    recentlyScannedItemId = item.id;
  }

  saveWeeklyItems();
  renderItems();
}

async function handleBarcodeValue(barcode, source) {
  const normalizedBarcode = normalizeBarcode(barcode);

  if (!normalizedBarcode) {
    return null;
  }

  itemBarcodeInput.value = normalizedBarcode;
  showItemForm();
  setStatus(`${source} found ${normalizedBarcode}. Searching Supabase...`);

  try {
    const catalogItem = await findCatalogItemByBarcode(normalizedBarcode);

    if (!catalogItem) {
      editingItemId = null;
      itemNameInput.value = "";
      itemPriceInput.value = "";
      itemDiscountPriceInput.value = "";
      itemQuantityInput.value = "1";
      submitButton.textContent = "Add item";
      setStatus(`${source} found ${normalizedBarcode}. This barcode is not in Supabase yet.`);
      itemNameInput.focus();
      return null;
    }

    const existingWeeklyItem = findWeeklyItemByBarcode(normalizedBarcode);
    const weeklyItem = {
      ...catalogRowToWeeklyItem(catalogItem, existingWeeklyItem),
      selected: true,
    };
    addOrUpdateWeeklyItem(weeklyItem);
    startEditing(weeklyItem);
    setStatus(`${source} matched ${catalogItem.name}. Latest normal price loaded.`);
    scrollToItem(weeklyItem.id);
    return weeklyItem;
  } catch (error) {
    setStatus(error.message || "Could not search Supabase. Check your connection and settings.");
    return null;
  }
}

function scrollToItem(itemId) {
  const row = document.querySelector(`[data-item-id="${itemId}"]`);

  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function renderItems() {
  itemList.innerHTML = "";

  const visibleItems = getVisibleItems();

  visibleItems.forEach((item) => {
    const row = document.createElement("li");
    row.className = "item-row";
    row.dataset.itemId = item.id;
    row.classList.toggle("editing", item.id === editingItemId);
    row.classList.toggle("scanned-match", item.id === recentlyScannedItemId);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.selected;
    checkbox.setAttribute("aria-label", `Select ${item.name}`);
    checkbox.addEventListener("change", () => {
      item.selected = checkbox.checked;
      saveWeeklyItems();
      renderItems();
    });

    const details = document.createElement("div");

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;

    const price = document.createElement("span");
    price.className = "item-price";
    price.textContent = `${formatPrice(item.normalPrice)} normal`;

    const meta = document.createElement("div");
    meta.className = "item-meta";

    const quantity = document.createElement("span");
    quantity.className = "item-quantity";
    quantity.textContent = `Qty ${item.quantity}`;
    meta.append(quantity);

    if (Number.isFinite(item.discountPrice)) {
      const discount = document.createElement("span");
      discount.className = "item-discount";
      discount.textContent = `${formatPrice(item.discountPrice)} discount`;
      meta.append(discount);
    }

    details.append(name, price, meta);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const editButton = document.createElement("button");
    editButton.className = "edit-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${item.name}`);
    editButton.addEventListener("click", () => {
      startEditing(item);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Remove";
    deleteButton.setAttribute("aria-label", `Remove ${item.name}`);
    deleteButton.addEventListener("click", () => {
      weeklyItems = weeklyItems.filter((savedItem) => savedItem.id !== item.id);
      if (editingItemId === item.id) {
        resetForm();
        hideItemForm();
      }
      saveWeeklyItems();
      renderItems();
    });

    actions.append(editButton, deleteButton);
    row.append(checkbox, details, actions);
    itemList.append(row);
  });

  totalPrice.textContent = formatPrice(calculateTotal());
  emptyState.textContent = weeklyItems.length === 0 ? "Add an item to start your checklist." : "No items match this filter.";
  emptyState.hidden = visibleItems.length > 0;
  clearSelectedButton.disabled = !weeklyItems.some((item) => item.selected);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const barcode = normalizeBarcode(itemBarcodeInput.value);
  const name = itemNameInput.value.trim();
  const normalPrice = Number.parseFloat(itemPriceInput.value);
  const discountPriceValue = itemDiscountPriceInput.value.trim();
  const discountPrice = discountPriceValue === "" ? null : Number.parseFloat(discountPriceValue);
  const quantity = Number.parseInt(itemQuantityInput.value, 10);

  if (
    !barcode ||
    !name ||
    Number.isNaN(normalPrice) ||
    normalPrice < 0 ||
    (discountPrice !== null && (Number.isNaN(discountPrice) || discountPrice < 0)) ||
    Number.isNaN(quantity) ||
    quantity < 1 ||
    quantity > 10
  ) {
    setStatus("Add a barcode, item name, valid normal price, and quantity.");
    return;
  }

  submitButton.disabled = true;
  setStatus("Saving latest normal price to Supabase...");

  try {
    const catalogItem = await saveCatalogItem({ barcode, name, normalPrice });
    const existingItem = editingItemId
      ? weeklyItems.find((item) => item.id === editingItemId)
      : findWeeklyItemByBarcode(barcode);
    const weeklyItem = {
      ...catalogRowToWeeklyItem(catalogItem, existingItem),
      discountPrice,
      quantity,
      selected: existingItem?.selected ?? false,
    };

    addOrUpdateWeeklyItem(weeklyItem);
    resetForm();
    hideItemForm();
  } catch (error) {
    setStatus(error.message || "Could not save to Supabase.");
  } finally {
    submitButton.disabled = false;
  }
});

function getBarcodeFormats() {
  const formats = globalThis.Html5QrcodeSupportedFormats;

  if (!formats) {
    return undefined;
  }

  return [
    formats.EAN_13,
    formats.EAN_8,
    formats.UPC_A,
    formats.UPC_E,
    formats.CODE_128,
    formats.CODE_39,
  ].filter((format) => format !== undefined);
}

function getScannerConfig() {
  const config = {
    fps: 10,
    qrbox: {
      width: 280,
      height: 160,
    },
  };
  const formatsToSupport = getBarcodeFormats();

  if (formatsToSupport) {
    config.formatsToSupport = formatsToSupport;
  }

  return config;
}

async function stopScanner() {
  if (!html5QrCode || !isScanning) {
    scannerArea.classList.remove("active");
    startScanButton.disabled = false;
    stopScanButton.disabled = true;
    return;
  }

  try {
    await html5QrCode.stop();
    html5QrCode.clear();
  } catch {
    setStatus("Scanner stopped.");
  } finally {
    isScanning = false;
    isHandlingScan = false;
    scannerArea.classList.remove("active");
    startScanButton.disabled = false;
    stopScanButton.disabled = true;
  }
}

async function handleScanSuccess(decodedText) {
  if (isHandlingScan) {
    return;
  }

  isHandlingScan = true;
  await handleBarcodeValue(decodedText, "Scan");
  await stopScanner();
}

async function startScanner() {
  if (!globalThis.Html5Qrcode) {
    setStatus("Barcode scanner library is not available. Use manual input instead.");
    return;
  }

  if (!html5QrCode) {
    html5QrCode = new globalThis.Html5Qrcode("scanner");
  }

  const scannerConfig = getScannerConfig();
  scannerArea.classList.add("active");
  startScanButton.disabled = true;
  stopScanButton.disabled = false;
  setStatus("Starting camera...");

  try {
    await html5QrCode.start({ facingMode: { exact: "environment" } }, scannerConfig, handleScanSuccess);
  } catch {
    try {
      await html5QrCode.start({ facingMode: "environment" }, scannerConfig, handleScanSuccess);
    } catch {
      setStatus("Could not start camera. Check browser camera permission or use manual input.");
      scannerArea.classList.remove("active");
      startScanButton.disabled = false;
      stopScanButton.disabled = true;
      return;
    }
  }

  isScanning = true;
  isHandlingScan = false;
  setStatus("Point the camera at a retail barcode.");
}

clearSelectedButton.addEventListener("click", () => {
  weeklyItems = weeklyItems.filter((item) => !item.selected);
  resetForm();
  hideItemForm();
  saveWeeklyItems();
  renderItems();
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  hideItemForm();
  renderItems();
});

itemBarcodeInput.addEventListener("change", () => {
  handleBarcodeValue(itemBarcodeInput.value, "Barcode");
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginWithPassword();
});
signUpButton.addEventListener("click", signUpWithPassword);
logoutButton.addEventListener("click", logout);
startScanButton.addEventListener("click", startScanner);
stopScanButton.addEventListener("click", stopScanner);
showItemFormButton.addEventListener("click", () => {
  resetForm();
  showItemForm();
  itemBarcodeInput.focus();
  renderItems();
});
statusFilter.addEventListener("change", renderItems);

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      showLoggedOutState();
      return;
    }

    if (session) {
      showLoggedInState(session);
    }
  });
} else {
  setStatus("Add your Supabase URL and anon key in supabase-config.js before syncing items.");
}

renderItems();
loadSession();

const weeklyStorageKeyPrefix = "shoppingChecklistWeeklyItems";
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
const itemCategoryInput = document.querySelector("#itemCategory");
const categoryOptions = document.querySelector("#categoryOptions");
const itemPriceInput = document.querySelector("#itemPrice");
const itemQuantityInput = document.querySelector("#itemQuantity");
const submitButton = document.querySelector("#submitButton");
const cancelEditButton = document.querySelector("#cancelEdit");
const itemList = document.querySelector("#itemList");
const totalPrice = document.querySelector("#totalPrice");
const emptyState = document.querySelector("#emptyState");
const clearSelectedButton = document.querySelector("#clearSelected");
const editModeButton = document.querySelector("#editModeButton");
const categoryFilter = document.querySelector("#categoryFilter");
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

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

let weeklyItems = [];
let editingItemId = null;
let recentlyScannedItemId = null;
let html5QrCode = null;
let isScanning = false;
let isHandlingScan = false;
let currentSession = null;
let isEditMode = false;

function loadWeeklyItems() {
  const savedItems = localStorage.getItem(getWeeklyStorageKey()) || (!currentSession ? localStorage.getItem(legacyStorageKey) : null);

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
    category: normalizeCategory(item.category),
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

  localStorage.setItem(getWeeklyStorageKey(), JSON.stringify(localWeeklyState));
}

function getWeeklyStorageKey() {
  return currentSession?.user?.id ? `${weeklyStorageKeyPrefix}:${currentSession.user.id}` : weeklyStorageKeyPrefix;
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

function normalizeCategory(category) {
  return (category || "").trim();
}

function getItemCategoryLabel(item) {
  return item.category || "Uncategorized";
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
    return categoryFilter.value === "all" || getItemCategoryLabel(item) === categoryFilter.value;
  });
}

function renderCategoryFilter() {
  const selectedCategory = categoryFilter.value;
  const categories = [...new Set(weeklyItems.map((item) => getItemCategoryLabel(item)))].sort((a, b) =>
    a.localeCompare(b)
  );

  categoryFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All categories";
  categoryFilter.append(allOption);

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.append(option);
  });

  categoryFilter.value = categories.includes(selectedCategory) ? selectedCategory : "all";

  if (categoryOptions) {
    categoryOptions.innerHTML = "";

    categories
      .filter((category) => category !== "Uncategorized")
      .forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        categoryOptions.append(option);
      });
  }
}

function isMissingCategoryColumnError(error) {
  return Boolean(error?.message && error.message.toLowerCase().includes("category"));
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
  weeklyItems = loadWeeklyItems();
  renderItems();
  authSection.hidden = true;
  appShell.hidden = false;
  setAuthStatus("");
}

function showLoggedOutState(message = "") {
  currentSession = null;
  weeklyItems = [];
  renderItems();
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

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

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
  itemCategoryInput.value = item.category || "";
  itemPriceInput.value = item.normalPrice.toFixed(2);
  itemQuantityInput.value = item.quantity;
  submitButton.textContent = "Save item";
  itemNameInput.focus();
  renderItems();
}

function catalogRowToWeeklyItem(row, existingItem = null) {
  return {
    id: existingItem?.id || createItemId(),
    catalogId: row.id || existingItem?.catalogId || null,
    barcode: row.barcode,
    name: row.name,
    category: normalizeCategory(row.category ?? existingItem?.category),
    normalPrice: Number(row.latest_price) || 0,
    discountPrice: existingItem?.discountPrice ?? null,
    quantity: existingItem?.quantity || 1,
    selected: existingItem?.selected ?? false,
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
    .select("id,user_id,barcode,name,category,latest_price,updated_at")
    .eq("barcode", barcode)
    .eq("user_id", currentSession.user.id)
    .maybeSingle();

  if (isMissingCategoryColumnError(error)) {
    const fallback = await supabaseClient
      .from(catalogTableName)
      .select("id,user_id,barcode,name,latest_price,updated_at")
      .eq("barcode", barcode)
      .eq("user_id", currentSession.user.id)
      .maybeSingle();

    if (fallback.error) {
      throw fallback.error;
    }

    return fallback.data;
  }

  if (error) {
    throw error;
  }

  return data;
}

async function refreshWeeklyItemsFromSupabase() {
  if (!supabaseClient || !currentSession) {
    return;
  }

  setStatus("Loading items from Supabase...");

  const { data, error } = await supabaseClient
    .from(catalogTableName)
    .select("id,user_id,barcode,name,category,latest_price,updated_at")
    .eq("user_id", currentSession.user.id)
    .order("name", { ascending: true });

  if (isMissingCategoryColumnError(error)) {
    const fallback = await supabaseClient
      .from(catalogTableName)
      .select("id,user_id,barcode,name,latest_price,updated_at")
      .eq("user_id", currentSession.user.id)
      .order("name", { ascending: true });

    if (fallback.error) {
      setStatus(fallback.error.message || "Could not load Supabase items.");
      return;
    }

    const weeklyState = new Map(weeklyItems.map((item) => [item.barcode, item]));
    weeklyItems = (fallback.data || []).map((catalogItem) =>
      catalogRowToWeeklyItem(catalogItem, weeklyState.get(catalogItem.barcode))
    );

    renderItems();
    setStatus("Items loaded from Supabase. Add the category column to enable categories.");
    return;
  }

  if (error) {
    setStatus(error.message || "Could not load Supabase items.");
    return;
  }

  const weeklyState = new Map(weeklyItems.map((item) => [item.barcode, item]));

  weeklyItems = (data || []).map((catalogItem) => catalogRowToWeeklyItem(catalogItem, weeklyState.get(catalogItem.barcode)));

  renderItems();
  setStatus("Items loaded from Supabase.");
}

async function saveCatalogItem({ catalogId, barcode, name, category, normalPrice }) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured. Add your URL and anon key in supabase-config.js.");
  }

  if (!currentSession) {
    throw new Error("Log in before saving items.");
  }

  const { data: existingItem, error: findError } = catalogId
    ? { data: { id: catalogId }, error: null }
    : await supabaseClient
        .from(catalogTableName)
        .select("id")
        .eq("barcode", barcode)
        .eq("user_id", currentSession.user.id)
        .maybeSingle();

  if (findError) {
    throw findError;
  }

  const savedItem = {
    barcode,
    name,
    category,
    latest_price: normalPrice,
    updated_at: new Date().toISOString(),
  };

  const query = existingItem
    ? supabaseClient.from(catalogTableName).update(savedItem).eq("id", existingItem.id)
    : supabaseClient.from(catalogTableName).insert({ ...savedItem, user_id: currentSession.user.id });

  const { data, error } = await query
    .select("id,user_id,barcode,name,category,latest_price,updated_at")
    .single();

  if (isMissingCategoryColumnError(error)) {
    const fallbackItem = {
      barcode,
      name,
      latest_price: normalPrice,
      updated_at: new Date().toISOString(),
    };
    const fallbackQuery = existingItem
      ? supabaseClient.from(catalogTableName).update(fallbackItem).eq("id", existingItem.id)
      : supabaseClient.from(catalogTableName).insert({ ...fallbackItem, user_id: currentSession.user.id });
    const fallback = await fallbackQuery
      .select("id,user_id,barcode,name,latest_price,updated_at")
      .single();

    if (fallback.error) {
      throw fallback.error;
    }

    return fallback.data;
  }

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

function selectWeeklyItem(item) {
  item.selected = true;
  recentlyScannedItemId = item.id;
  saveWeeklyItems();
  renderItems();
  scrollToItem(item.id);
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
      itemCategoryInput.value = "";
      itemPriceInput.value = "";
      itemQuantityInput.value = "1";
      submitButton.textContent = "Add item";
      setStatus(`${source} found ${normalizedBarcode}. This barcode is not in Supabase yet.`);
      itemNameInput.focus();
      return null;
    }

    const existingWeeklyItem = findWeeklyItemByBarcode(normalizedBarcode);
    if (existingWeeklyItem && !isEditMode) {
      selectWeeklyItem(existingWeeklyItem);
      setStatus(`${source} matched ${existingWeeklyItem.name}. Item selected.`);
      return existingWeeklyItem;
    }

    const weeklyItem = {
      ...catalogRowToWeeklyItem(catalogItem, existingWeeklyItem),
      selected: true,
    };
    addOrUpdateWeeklyItem(weeklyItem);
    if (isEditMode) {
      startEditing(weeklyItem);
    } else {
      hideItemForm();
    }
    setStatus(`${source} matched ${catalogItem.name}. Item selected.`);
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

function updateWeeklyItemQuantity(item, value) {
  const quantity = Number.parseInt(value, 10);

  if (Number.isNaN(quantity) || quantity < 1 || quantity > 10) {
    renderItems();
    return;
  }

  item.quantity = quantity;
  saveWeeklyItems();
  renderItems();
}

function updateWeeklyItemPrice(item, value) {
  const price = Number.parseFloat(value);

  if (Number.isNaN(price) || price < 0) {
    renderItems();
    return;
  }

  item.discountPrice = price === item.normalPrice ? null : price;
  saveWeeklyItems();
  renderItems();
}

function renderItems() {
  itemList.innerHTML = "";
  renderCategoryFilter();
  editModeButton.textContent = isEditMode ? "Checklist" : "Edit";
  appShell.classList.toggle("edit-mode", isEditMode);

  const visibleItems = getVisibleItems();

  visibleItems.forEach((item) => {
    const row = document.createElement("li");
    row.className = "item-row";
    row.dataset.itemId = item.id;
    row.classList.toggle("editing", item.id === editingItemId);
    row.classList.toggle("scanned-match", item.id === recentlyScannedItemId);

    let checkbox = null;

    if (!isEditMode) {
      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.selected;
      checkbox.setAttribute("aria-label", `Plan ${item.name}`);
      checkbox.addEventListener("change", () => {
        item.selected = checkbox.checked;
        saveWeeklyItems();
        renderItems();
      });
    }

    const details = document.createElement("div");
    details.className = "item-details";

    const title = document.createElement("div");
    title.className = "item-title";

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;

    const category = document.createElement("span");
    category.className = "item-category";
    category.textContent = getItemCategoryLabel(item);

    title.append(name, category);

    const meta = document.createElement("div");
    meta.className = "item-meta";

    if (!isEditMode) {
      const quantityLabel = document.createElement("label");
      quantityLabel.className = "item-inline-field";
      quantityLabel.textContent = "Qty";

      const quantity = document.createElement("select");
      quantity.className = "item-inline-input";
      for (let count = 1; count <= 10; count += 1) {
        const option = document.createElement("option");
        option.value = String(count);
        option.textContent = String(count);
        quantity.append(option);
      }
      quantity.value = item.quantity;
      quantity.setAttribute("aria-label", `Quantity for ${item.name}`);
      quantity.addEventListener("change", () => {
        updateWeeklyItemQuantity(item, quantity.value);
      });
      quantityLabel.append(quantity);

      const priceLabel = document.createElement("label");
      priceLabel.className = "item-inline-field";
      priceLabel.textContent = "Price";

      const price = document.createElement("input");
      price.className = "item-inline-input";
      price.type = "number";
      price.min = "0";
      price.step = "0.01";
      price.inputMode = "decimal";
      price.value = getActivePrice(item).toFixed(2);
      price.setAttribute("aria-label", `Price for ${item.name}`);
      price.addEventListener("change", () => {
        updateWeeklyItemPrice(item, price.value);
      });
      priceLabel.append(price);

      meta.append(quantityLabel, priceLabel);
    }

    details.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    if (isEditMode) {
      const selectButton = document.createElement("button");
      selectButton.className = "edit-button";
      selectButton.type = "button";
      selectButton.textContent = "Select";
      selectButton.setAttribute("aria-label", `Select ${item.name} to edit`);
      selectButton.addEventListener("click", () => {
        startEditing(item);
      });

      actions.append(selectButton);
    }

    if (checkbox) {
      row.append(checkbox, details, actions);
    } else {
      row.append(details, actions);
    }
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
  const category = normalizeCategory(itemCategoryInput.value);
  const normalPrice = Number.parseFloat(itemPriceInput.value);
  const quantity = Number.parseInt(itemQuantityInput.value, 10);

  if (
    !barcode ||
    !name ||
    Number.isNaN(normalPrice) ||
    normalPrice < 0 ||
    Number.isNaN(quantity) ||
    quantity < 1 ||
    quantity > 10
  ) {
    setStatus("Add a barcode, item name, valid latest price, and quantity.");
    return;
  }

  submitButton.disabled = true;
  setStatus("Saving latest price to Supabase...");

  try {
    const existingItem = editingItemId
      ? weeklyItems.find((item) => item.id === editingItemId)
      : findWeeklyItemByBarcode(barcode);
    const catalogItem = await saveCatalogItem({
      catalogId: existingItem?.catalogId,
      barcode,
      name,
      category,
      normalPrice,
    });
    const weeklyItem = {
      ...catalogRowToWeeklyItem(catalogItem, existingItem),
      discountPrice: null,
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
  weeklyItems = weeklyItems.map((item) => ({
    ...item,
    selected: false,
  }));
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
editModeButton.addEventListener("click", () => {
  isEditMode = !isEditMode;
  resetForm();
  hideItemForm();
  renderItems();
  setStatus(isEditMode ? "Edit mode. Select an item to edit." : "Checklist mode.");
});
categoryFilter.addEventListener("change", renderItems);

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

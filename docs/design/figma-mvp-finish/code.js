const MVP_PAGE_NAME = 'MVP · Travel Chat';
const TOKEN_BOARD_NAME = 'Design tokens / roamwise MVP';
const BRAND_TOGGLE_NAME = 'Brand collapse / Updated';
const ROW_PATTERN = /^\d{2}\s*\/\s*/;
const OWNER_KEY = 'roamwiseMvpOwner';
const OWNER_VALUE = 'v2';
const SIDEBAR_COMPONENT_NAMES = new Set([
  'Sidebar / Workspace / Signed in',
  'Sidebar / Workspace / Signed out',
]);
const AUTH_FIELD_COMPONENT_NAMES = new Set([
  'Auth / Text Field / Default',
  'Auth / Text Field / Filled',
  'Auth / Text Field / Password',
  'Auth / Text Field / Error',
]);
const AUTH_MODAL_COMPONENT_NAMES = new Set([
  'Auth modal / Sign in',
  'Auth modal / Create account',
]);

function markOwned(node) {
  node.setPluginData(OWNER_KEY, OWNER_VALUE);
  return node;
}

function isOwned(node) {
  let current = node;
  while (current) {
    if (
      'getPluginData' in current &&
      current.getPluginData(OWNER_KEY) === OWNER_VALUE
    ) {
      return true;
    }
    if (current.type === 'PAGE') break;
    current = current.parent;
  }
  return false;
}

function claimLegacyMvpPage(page) {
  if (isOwned(page)) return;
  const hasKnownState = page.children.some(
    node =>
      (node.type === 'FRAME' || node.type === 'INSTANCE') &&
      node.name === '01 / New chat — blank',
  );
  if (hasKnownState) {
    markOwned(page);
  }
}

async function claimLegacyThemePage(page) {
  if (page.name !== 'MVP · Theme Screens') return;
  await page.loadAsync();
  if (isOwned(page)) return;
  const safeChildren = page.children.every(
    node => node.type === 'TEXT' ||
      (node.type === 'INSTANCE' && ROW_PATTERN.test(node.name)),
  );
  if (safeChildren) markOwned(page);
}

function rgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function solid(hex, opacity = 1) {
  return { type: 'SOLID', color: rgb(hex), opacity };
}

async function loadFonts(names) {
  await Promise.all(names.map(name => figma.loadFontAsync(name)));
}

async function loadFontsForNodes(nodes) {
  const fonts = new Map();
  for (const node of nodes) {
    if (node.type !== 'TEXT' || node.fontName === figma.mixed) continue;
    fonts.set(`${node.fontName.family}|${node.fontName.style}`, node.fontName);
  }
  await Promise.all([...fonts.values()].map(font => figma.loadFontAsync(font)));
}

function createFrame(parent, name, x, y, width, height, options = {}) {
  const node = figma.createFrame();
  parent.appendChild(node);
  node.name = name;
  node.resize(width, height);
  node.x = x;
  node.y = y;
  node.fills = options.fill ? [options.fill] : [];
  node.strokes = options.stroke ? [options.stroke] : [];
  node.strokeWeight = options.stroke ? 1 : 0;
  node.strokeAlign = 'INSIDE';
  node.cornerRadius = options.radius || 0;
  node.clipsContent = Boolean(options.clip);
  return node;
}

function createAuto(parent, name, direction, width, height) {
  const node = figma.createFrame();
  parent.appendChild(node);
  node.name = name;
  node.resize(width, height);
  node.layoutMode = direction;
  node.primaryAxisSizingMode = 'FIXED';
  node.counterAxisSizingMode = 'FIXED';
  node.itemSpacing = 0;
  node.fills = [];
  return node;
}

async function addText(parent, value, x, y, style, fill, options = {}) {
  const node = figma.createText();
  parent.appendChild(node);
  node.name = options.name || value.slice(0, 32);
  node.fontName = options.fontName || { family: 'Inter', style: 'Regular' };
  node.fontSize = style.fontSize;
  node.lineHeight = style.lineHeight;
  node.letterSpacing = style.letterSpacing;
  node.characters = value;
  await node.setTextStyleIdAsync(style.id);
  node.fills = [fill];
  node.textAlignHorizontal = options.align || 'LEFT';
  if (options.width) {
    node.resize(options.width, 10);
    node.textAutoResize = 'HEIGHT';
  } else {
    node.textAutoResize = 'WIDTH_AND_HEIGHT';
  }
  node.x = x;
  node.y = y;
  return node;
}

function addSvg(parent, name, x, y, size, source, colorVariable) {
  const node = figma.createNodeFromSvg(source);
  parent.appendChild(node);
  node.name = name;
  node.x = x;
  node.y = y;
  node.resize(size, size);
  node.fills = [];
  node.strokes = [];
  if (colorVariable) {
    for (const vector of node.findAll(() => true)) {
      if (Array.isArray(vector.fills)) {
        vector.fills = vector.fills.map(fill =>
          fill.type === 'SOLID' ? bindPaint(colorVariable, fill.opacity ?? 1) : fill,
        );
      }
      if (Array.isArray(vector.strokes)) {
        vector.strokes = vector.strokes.map(stroke =>
          stroke.type === 'SOLID' ? bindPaint(colorVariable, stroke.opacity ?? 1) : stroke,
        );
      }
    }
  }
  return node;
}

function bindPaint(variable, opacity = 1) {
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity },
    'color',
    variable,
  );
}

function findVariable(variables, collectionId, name) {
  const variable = variables.find(item => item.variableCollectionId === collectionId && item.name === name);
  if (!variable) throw new Error(`Missing variable: ${name}`);
  return variable;
}

function findLightComponent(page, name) {
  const direct = page.findOne(node => node.type === 'COMPONENT' && node.name === name);
  if (direct) return direct;
  const set = page.findOne(node => node.type === 'COMPONENT_SET' && node.name === name);
  if (!set) return null;
  return set.children.find(
    node => node.type === 'COMPONENT' && node.name.includes('Theme=Light'),
  ) || null;
}

function ensureVariable(variables, collection, name, type, scopes, codeName) {
  let variable = variables.find(item => item.variableCollectionId === collection.id && item.name === name);
  if (!variable) {
    variable = figma.variables.createVariable(name, collection, type);
    variables.push(variable);
  }
  variable.scopes = scopes;
  variable.setVariableCodeSyntax('WEB', `var(--${codeName || name.replaceAll('/', '-')})`);
  return variable;
}

async function ensureDesignTokens() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const primitives = collections.find(item => item.name === 'Travel / Primitives');
  const colors = collections.find(item => item.name === 'Travel / Color');
  if (!primitives || !colors) {
    throw new Error(
      'Travel token collections are missing. Run this repair in the initialized Travel Web GPT file.',
    );
  }
  const primitiveMode = primitives.modes[0].modeId;
  const colorMode = colors.modes[0].modeId;

  const newPrimitives = {
    'slate/50': '#EDF1F7',
    'slate/500': '#65718A',
    'slate/800': '#26324A',
  };
  const primitiveMap = new Map();
  for (const item of variables.filter(variable => variable.variableCollectionId === primitives.id)) {
    primitiveMap.set(item.name, item);
  }
  for (const [name, value] of Object.entries(newPrimitives)) {
    const variable = ensureVariable(variables, primitives, name, 'COLOR', []);
    variable.setValueForMode(primitiveMode, rgb(value));
    primitiveMap.set(name, variable);
  }

  const semantics = {
    'color/bg/nav-active': ['slate/50', ['FRAME_FILL', 'SHAPE_FILL']],
    'color/bg/brand-tile': ['slate/800', ['FRAME_FILL', 'SHAPE_FILL']],
    'color/text/nav': ['slate/500', ['TEXT_FILL']],
    'color/text/nav-active': ['slate/800', ['TEXT_FILL']],
    'color/status/online': ['teal/500', ['TEXT_FILL', 'SHAPE_FILL']],
  };
  const semanticMap = new Map();
  for (const item of variables.filter(variable => variable.variableCollectionId === colors.id)) {
    semanticMap.set(item.name, item);
  }
  for (const [name, [primitiveName, scopes]] of Object.entries(semantics)) {
    const variable = ensureVariable(variables, colors, name, 'COLOR', scopes);
    variable.setValueForMode(colorMode, { type: 'VARIABLE_ALIAS', id: primitiveMap.get(primitiveName).id });
    semanticMap.set(name, variable);
  }

  const names = [
    'color/bg/canvas',
    'color/bg/sidebar',
    'color/bg/surface',
    'color/bg/muted',
    'color/bg/brand-subtle',
    'color/bg/user',
    'color/bg/nav-active',
    'color/bg/brand-tile',
    'color/text/primary',
    'color/text/secondary',
    'color/text/tertiary',
    'color/text/inverse',
    'color/text/brand',
    'color/text/nav',
    'color/text/nav-active',
    'color/border/default',
    'color/border/subtle',
    'color/border/focus',
    'color/action/primary',
    'color/action/hover',
    'color/status/success',
    'color/status/warning',
    'color/status/error',
    'color/status/info',
    'color/status/online',
  ];
  return Object.fromEntries(
    names.map(name => {
      const variable = semanticMap.get(name);
      if (!variable) throw new Error(`Missing semantic token: ${name}`);
      return [name, variable];
    }),
  );
}

async function ensureDarkTokens() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  let collection = collections.find(item => item.name === 'Travel / Color Dark');
  if (!collection) collection = figma.variables.createVariableCollection('Travel / Color Dark');
  if (collection.modes[0].name !== 'Dark') collection.renameMode(collection.modes[0].modeId, 'Dark');
  const modeId = collection.modes[0].modeId;
  const darkValues = {
    'color/bg/canvas': '#101513',
    'color/bg/sidebar': '#17201D',
    'color/bg/surface': '#222B27',
    'color/bg/muted': '#2B3531',
    'color/bg/brand-subtle': '#20352F',
    'color/bg/user': '#2F3B36',
    'color/bg/nav-active': '#27342F',
    'color/bg/brand-tile': '#27324A',
    'color/text/primary': '#F4F7F5',
    'color/text/secondary': '#B7C2BD',
    'color/text/tertiary': '#899690',
    'color/text/inverse': '#FFFFFF',
    'color/text/brand': '#63D9C2',
    'color/text/nav': '#B4BFC0',
    'color/text/nav-active': '#F7FAF8',
    'color/border/default': '#3A4742',
    'color/border/subtle': '#2E3A35',
    'color/border/focus': '#4DD2B8',
    'color/action/primary': '#22B69A',
    'color/action/hover': '#38C6AB',
    'color/status/success': '#3DDBBD',
    'color/status/warning': '#F5BE59',
    'color/status/error': '#FF7B7B',
    'color/status/info': '#59BDF2',
    'color/status/online': '#3DDBBD',
  };
  const scopes = {
    bg: ['FRAME_FILL', 'SHAPE_FILL'],
    text: ['TEXT_FILL'],
    border: ['STROKE_COLOR'],
    action: ['FRAME_FILL', 'SHAPE_FILL'],
    status: ['TEXT_FILL', 'SHAPE_FILL'],
  };
  const result = {};
  for (const [name, value] of Object.entries(darkValues)) {
    const variable = ensureVariable(
      variables,
      collection,
      name,
      'COLOR',
      name.includes('/text/') ? scopes.text : name.includes('/border/') ? scopes.border : name.includes('/status/') ? scopes.status : name.includes('/action/') ? scopes.action : scopes.bg,
      `dark-${name.replaceAll('/', '-')}`,
    );
    variable.setValueForMode(modeId, rgb(value));
    result[name] = variable;
  }
  return result;
}

async function getTextStyles() {
  const all = await figma.getLocalTextStylesAsync();
  const resolve = name => {
    const style = all.find(item => item.name === `Travel / ${name}`);
    if (!style) {
      throw new Error(
        `Missing text style: Travel / ${name}. Run this repair in the initialized Travel Web GPT file.`,
      );
    }
    return style;
  };
  return {
    display: resolve('Display'),
    heading: resolve('Heading'),
    title: resolve('Title'),
    body: resolve('Body'),
    bodySmall: resolve('Body Small'),
    label: resolve('Label'),
    caption: resolve('Caption'),
  };
}

function logo(parent, tokens, x, y, size = 48) {
  const tile = createFrame(parent, 'Brand mark', x, y, size, size, {
    fill: bindPaint(tokens['color/bg/brand-tile']),
    radius: Math.round(size * 0.3),
  });
  addSvg(
    tile,
    'roamwise sparkle',
    size * 0.18,
    size * 0.13,
    size * 0.62,
    `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 3L25 16L38 21L25 26L20 39L15 26L2 21L15 16L20 3Z" fill="#FFFFFF"/>
      <path d="M34 29L37 36L44 39L37 42L34 49L31 42L24 39L31 36L34 29Z" fill="#FFFFFF" fill-opacity=".94"/>
      <circle cx="40" cy="33" r="4" fill="#23B69B"/>
    </svg>`,
  );
  return tile;
}

function navIcon(type) {
  const icons = {
    planner: '<svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 6V14M6 10H14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trips: '<svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7H14M6 11H12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    explore: '<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 10H17.5M10 2C7.5 5 7.5 15 10 18M10 2C12.5 5 12.5 15 10 18" fill="none" stroke="currentColor" stroke-width="1.25"/></svg>',
    guides: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 5H8C9.1 5 10 5.9 10 7V17C10 15.9 9.1 15 8 15H3V5ZM17 5H12C10.9 5 10 5.9 10 7V17C10 15.9 10.9 15 12 15H17V5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  };
  return icons[type];
}

function iconFrame(parent, name, width, height, fill, icon, iconSize = 20, iconColor = null) {
  const frame = createFrame(parent, name, 0, 0, width, height, fill ? { fill, radius: 10 } : {});
  addSvg(
    frame,
    `${name} icon`,
    (width - iconSize) / 2,
    (height - iconSize) / 2,
    iconSize,
    icon,
    iconColor,
  );
  return frame;
}

async function createSidebar(page, tokens, styles, signedIn, x, y) {
  const component = figma.createComponent();
  page.appendChild(component);
  component.name = signedIn ? 'Sidebar / Workspace / Signed in' : 'Sidebar / Workspace / Signed out';
  component.resize(260, 900);
  component.x = x;
  component.y = y;
  component.fills = [bindPaint(tokens['color/bg/sidebar'])];
  component.layoutMode = 'VERTICAL';
  component.primaryAxisSizingMode = 'FIXED';
  component.counterAxisSizingMode = 'FIXED';
  component.paddingLeft = 20;
  component.paddingRight = 20;
  component.paddingTop = 24;
  component.paddingBottom = 20;
  component.itemSpacing = 3;

  const brand = createAuto(component, 'Brand header', 'HORIZONTAL', 220, 52);
  brand.layoutSizingHorizontal = 'FILL';
  brand.counterAxisAlignItems = 'CENTER';
  brand.itemSpacing = 10;
  logo(brand, tokens, 0, 0, 48);
  const wordmark = createAuto(brand, 'Brand wordmark', 'VERTICAL', 1, 40);
  wordmark.layoutSizingHorizontal = 'FILL';
  wordmark.primaryAxisAlignItems = 'CENTER';
  await addText(wordmark, 'roamwise', 0, 0, styles.title, bindPaint(tokens['color/text/primary']), { name: 'Brand name' });
  const spacer = createAuto(brand, 'Spacer', 'HORIZONTAL', 1, 1);
  spacer.layoutSizingHorizontal = 'FILL';
  const collapse = iconFrame(brand, 'Collapse sidebar', 28, 28, bindPaint(tokens['color/bg/surface']), `<svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="3" width="14" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 3V15M11 7L9 9L11 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`, 18, tokens['color/text/nav']);
  collapse.strokes = [bindPaint(tokens['color/border/subtle'])];
  collapse.strokeWeight = 1;

  await addText(component, 'WORKSPACE', 0, 0, styles.caption, bindPaint(tokens['color/text/nav']), { name: 'Workspace label' });

  const navItems = [
    { label: 'Trip planner', icon: 'planner', selected: true },
    { label: 'My trips', icon: 'trips', selected: false },
    { label: 'Explore places', icon: 'explore', selected: false },
    { label: 'Saved guides', icon: 'guides', selected: false },
  ];
  for (const item of navItems) {
    const row = createAuto(component, `Workspace / ${item.label}`, 'HORIZONTAL', 220, 36);
    row.layoutSizingHorizontal = 'FILL';
    row.counterAxisAlignItems = 'CENTER';
    row.paddingLeft = 12;
    row.paddingRight = 12;
    row.itemSpacing = 12;
    row.cornerRadius = 12;
    if (item.selected) row.fills = [bindPaint(tokens['color/bg/nav-active'])];
    const colorNode = item.selected ? tokens['color/text/nav-active'] : tokens['color/text/nav'];
    const icon = createFrame(row, `${item.label} icon`, 0, 0, 24, 24, {
      fill: bindPaint(tokens['color/bg/surface'], item.selected ? 0.82 : 0.58),
      radius: 8,
    });
    addSvg(icon, `${item.label} glyph`, 2, 2, 20, navIcon(item.icon), colorNode);
    await addText(row, item.label, 0, 0, styles.bodySmall, bindPaint(colorNode), { name: 'Workspace item' });
    if (item.selected) {
      const fill = createAuto(row, 'Nav spacer', 'HORIZONTAL', 1, 1);
      fill.layoutSizingHorizontal = 'FILL';
      const online = figma.createEllipse();
      row.appendChild(online);
      online.name = 'Trip planner online';
      online.resize(7, 7);
      online.fills = [bindPaint(tokens['color/status/online'])];
    }
  }

  const recentLabel = await addText(component, 'RECENT CHATS', 0, 0, styles.caption, bindPaint(tokens['color/text/nav']), { name: 'Recent chats label' });
  recentLabel.layoutSizingHorizontal = 'FILL';
  for (const [index, title] of ['Kyoto in five days', 'Bali or Phuket?'].entries()) {
    const active = index === 0;
    const row = createAuto(component, `Recent chat / ${title}`, 'HORIZONTAL', 220, 32);
    row.layoutSizingHorizontal = 'FILL';
    row.counterAxisAlignItems = 'CENTER';
    row.paddingLeft = 14;
    row.paddingRight = 14;
    row.cornerRadius = 10;
    if (active) row.fills = [bindPaint(tokens['color/bg/brand-subtle'])];
    await addText(row, title, 0, 0, styles.bodySmall, bindPaint(active ? tokens['color/text/primary'] : tokens['color/text/secondary']), { name: 'Chat title' });
  }

  const flexible = createAuto(component, 'Footer spacer', 'HORIZONTAL', 220, 1);
  flexible.layoutSizingHorizontal = 'FILL';
  flexible.layoutSizingVertical = 'FILL';

  const divider = figma.createLine();
  component.appendChild(divider);
  divider.name = 'Account divider';
  divider.resize(220, 0);
  divider.strokes = [bindPaint(tokens['color/border/subtle'])];
  divider.strokeWeight = 1;

  const account = createAuto(component, 'Account row', 'HORIZONTAL', 220, 54);
  account.layoutSizingHorizontal = 'FILL';
  account.counterAxisAlignItems = 'CENTER';
  account.itemSpacing = 10;
  const avatar = createFrame(account, 'Avatar', 0, 0, 38, 38, {
    fill: bindPaint(signedIn ? tokens['color/bg/brand-tile'] : tokens['color/bg/muted']),
    radius: 19,
  });
  addSvg(avatar, 'Avatar person', 10, 8, 18, `<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="5.5" r="3.1" fill="#FFFFFF"/><path d="M3 16C3.7 12.1 5.8 10.5 9 10.5C12.2 10.5 14.3 12.1 15 16" fill="#FFFFFF"/></svg>`, tokens[signedIn ? 'color/text/inverse' : 'color/text/nav']);
  const who = createAuto(account, 'Account text', 'VERTICAL', 1, 42);
  who.layoutSizingHorizontal = 'FILL';
  who.primaryAxisAlignItems = 'CENTER';
  await addText(who, signedIn ? 'Jamie Lee' : 'Guest', 0, 0, styles.label, bindPaint(tokens['color/text/primary']), { name: 'Account name' });
  await addText(who, signedIn ? 'Free plan' : 'Save your trips', 0, 0, styles.caption, bindPaint(tokens['color/text/nav']), { name: 'Account status' });
  if (signedIn) {
    addSvg(account, 'Account chevron', 202, 22, 12, '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4L6 8L10 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>', tokens['color/text/nav']);
  } else {
    const signIn = createAuto(account, 'Sign in CTA', 'HORIZONTAL', 58, 28);
    signIn.counterAxisAlignItems = 'CENTER';
    signIn.primaryAxisAlignItems = 'CENTER';
    signIn.strokes = [bindPaint(tokens['color/border/default'])];
    signIn.strokeWeight = 1;
    signIn.cornerRadius = 8;
    await addText(signIn, 'Sign in', 0, 0, styles.caption, bindPaint(tokens['color/text/brand']), { name: 'Sign in' });
  }
  return component;
}

function isStateFrame(node) {
  return node.type === 'FRAME' && ROW_PATTERN.test(node.name);
}

async function restoreStateFramesIfNeeded(page) {
  const instances = page.children.filter(
    node => node.type === 'INSTANCE' && ROW_PATTERN.test(node.name) && isOwned(node),
  );
  for (const instance of instances) {
    const name = instance.name;
    const x = instance.x;
    const y = instance.y;
    const main = await instance.getMainComponentAsync();
    if (main?.parent?.type === 'COMPONENT_SET') {
      const light = main.parent.children.find(
        node => node.type === 'COMPONENT' && node.name.includes('Theme=Light'),
      );
      if (light && light.id !== main.id) instance.swapComponent(light);
    }
    const frame = instance.detachInstance();
    frame.name = name;
    frame.x = x;
    frame.y = y;
  }
}

async function replaceSidebars(page, tokens, styles) {
  const states = page.children.filter(isStateFrame);
  const targets = [];
  for (const frame of states) {
    const sidebar = frame.children.find(node => node.type === 'INSTANCE' && node.name.startsWith('Sidebar /'));
    if (!sidebar) continue;
    targets.push({ frame, signedIn: !frame.name.includes('Signed out') });
    sidebar.remove();
  }
  for (const node of [...page.children]) {
    if (
      isOwned(node) &&
      (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') &&
      SIDEBAR_COMPONENT_NAMES.has(node.name)
    ) {
      node.remove();
    }
  }
  const signedIn = await createSidebar(page, tokens, styles, true, 64, 3610);
  const signedOut = await createSidebar(page, tokens, styles, false, 376, 3610);
  for (const target of targets) {
    const instance = (target.signedIn ? signedIn : signedOut).createInstance();
    target.frame.insertChild(0, instance);
    instance.resize(260, 900);
    instance.layoutSizingVertical = 'FILL';
  }
  return { signedIn, signedOut, targetCount: targets.length };
}

function createCollapsedSidebar(page, tokens, styles) {
  const sidebar = createFrame(page, 'Sidebar / Collapsed', 0, 0, 72, 900, {
    fill: bindPaint(tokens['color/bg/sidebar']),
  });
  sidebar.layoutMode = 'VERTICAL';
  sidebar.primaryAxisSizingMode = 'FIXED';
  sidebar.counterAxisSizingMode = 'FIXED';
  sidebar.paddingLeft = 12;
  sidebar.paddingRight = 12;
  sidebar.paddingTop = 22;
  sidebar.paddingBottom = 18;
  sidebar.counterAxisAlignItems = 'CENTER';
  sidebar.itemSpacing = 10;
  logo(sidebar, tokens, 0, 0, 44);
  const expand = iconFrame(sidebar, 'Expand sidebar', 36, 36, bindPaint(tokens['color/bg/surface']), `<svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="3" width="14" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 3V15M9 7L11 9L9 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`, 18, tokens['color/text/nav']);
  expand.strokes = [bindPaint(tokens['color/border/subtle'])];
  expand.strokeWeight = 1;
  iconFrame(sidebar, 'New chat', 40, 40, bindPaint(tokens['color/bg/nav-active']), navIcon('planner'), 20, tokens['color/text/nav-active']);
  iconFrame(sidebar, 'Library', 40, 40, bindPaint(tokens['color/bg/surface'], 0.58), navIcon('trips'), 20, tokens['color/text/nav']);
  const spacer = createAuto(sidebar, 'Spacer', 'HORIZONTAL', 1, 1);
  spacer.layoutSizingVertical = 'FILL';
  const avatar = createFrame(sidebar, 'Avatar', 0, 0, 38, 38, {
    fill: bindPaint(tokens['color/bg/brand-tile']),
    radius: 19,
  });
  addSvg(avatar, 'Avatar person', 10, 8, 18, '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="5.5" r="3.1" fill="#FFFFFF"/><path d="M3 16C3.7 12.1 5.8 10.5 9 10.5C12.2 10.5 14.3 12.1 15 16" fill="#FFFFFF"/></svg>', tokens['color/text/inverse']);
  return sidebar;
}

async function rebuildCollapsedState(page, tokens, styles) {
  const previous = page.findOne(node => node.type === 'FRAME' && node.name === '07 / Sidebar collapsed');
  if (previous) previous.remove();
  const base = page.findOne(node => node.type === 'FRAME' && node.name === '01 / New chat — blank');
  if (!base) throw new Error('Blank state frame is missing.');
  const clone = base.clone();
  clone.name = '07 / Sidebar collapsed';
  clone.x = 3240;
  clone.y = 2150;
  const sidebar = clone.children.find(node => node.type === 'INSTANCE' && node.name.startsWith('Sidebar /'));
  if (sidebar) sidebar.remove();
  const collapsed = createCollapsedSidebar(page, tokens, styles);
  clone.insertChild(0, collapsed);
  return clone;
}

async function applyDarkTheme(root, darkTokens) {
  const allVariables = await figma.variables.getLocalVariablesAsync();
  const variableNames = new Map(allVariables.map(variable => [variable.id, variable.name]));
  const rawMap = new Map([
    ['#000000', '#F4F7F5'],
    ['#17201D', '#F4F7F5'],
    ['#26324A', '#F4F7F5'],
    ['#3A4541', '#B7C2BD'],
    ['#69736F', '#B7C2BD'],
    ['#65718A', '#B4BFC0'],
    ['#8B9591', '#899690'],
    ['#FFFFFF', '#FFFFFF'],
    ['#FCFDFC', '#101513'],
    ['#F7F8F7', '#17201D'],
    ['#F1F3F2', '#2B3531'],
    ['#EAF7F3', '#20352F'],
    ['#EDF1F7', '#27342F'],
    ['#E7EBE8', '#2E3A35'],
    ['#DDE3E0', '#3A4742'],
  ]);
  const hex = color => `#${[color.r, color.g, color.b]
    .map(value => Math.round(value * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
  const nodes = [root, ...root.findAll(() => true)];
  const hasInstanceAncestor = node => {
    let parent = node.parent;
    while (parent && parent.type !== 'PAGE') {
      if (parent.type === 'INSTANCE') return true;
      parent = parent.parent;
    }
    return false;
  };
  const instances = nodes.filter(
    node => node.type === 'INSTANCE' && !hasInstanceAncestor(node),
  );
  for (const node of nodes) {
    if (Array.isArray(node.fills)) {
      const bindings = node.boundVariables?.fills;
      const next = node.fills.map((fill, index) => {
        if (fill.type !== 'SOLID') return fill;
        const binding = Array.isArray(bindings) ? bindings[index] || bindings[0] : null;
        const variableName = binding ? variableNames.get(binding.id) : null;
        if (variableName && darkTokens[variableName]) {
          return bindPaint(darkTokens[variableName], fill.opacity ?? 1);
        }
        const darkHex = rawMap.get(hex(fill.color));
        return darkHex ? { type: 'SOLID', color: rgb(darkHex), opacity: fill.opacity ?? 1 } : fill;
      });
      node.fills = next;
    }
    if (Array.isArray(node.strokes) && node.strokes.length) {
      const bindings = node.boundVariables?.strokes;
      const next = node.strokes.map((stroke, index) => {
        if (stroke.type !== 'SOLID') return stroke;
        const binding = Array.isArray(bindings) ? bindings[index] || bindings[0] : null;
        const variableName = binding ? variableNames.get(binding.id) : null;
        if (variableName && darkTokens[variableName]) {
          return bindPaint(darkTokens[variableName], stroke.opacity ?? 1);
        }
        const darkHex = rawMap.get(hex(stroke.color));
        return darkHex ? { type: 'SOLID', color: rgb(darkHex), opacity: stroke.opacity ?? 1 } : stroke;
      });
      node.strokes = next;
    }
  }
  for (const instance of instances) {
    try {
      const main = await instance.getMainComponentAsync();
      if (!main || main.parent?.type !== 'COMPONENT_SET') continue;
      const dark = main.parent.children.find(
        child => child.type === 'COMPONENT' && child.name.includes('Theme=Dark'),
      );
      if (dark && dark.id !== main.id) instance.swapComponent(dark);
    } catch (error) {
      if (!String(error).includes('does not exist')) throw error;
    }
  }
}

async function createThemeVariantSets(page, darkTokens) {
  const definitions = [
    { name: 'Auth / Text Field / Default', layout: 'VERTICAL' },
    { name: 'Auth / Text Field / Filled', layout: 'VERTICAL' },
    { name: 'Auth / Text Field / Password', layout: 'VERTICAL' },
    { name: 'Auth / Text Field / Error', layout: 'VERTICAL' },
    { name: 'Button / Primary', layout: 'VERTICAL' },
    { name: 'Composer / Empty', layout: 'VERTICAL' },
    { name: 'Composer / Typing', layout: 'VERTICAL' },
    { name: 'Composer / Waiting', layout: 'VERTICAL' },
    { name: 'Sidebar / Workspace / Signed in', layout: 'HORIZONTAL' },
    { name: 'Sidebar / Workspace / Signed out', layout: 'HORIZONTAL' },
    { name: 'Auth modal / Sign in', layout: 'HORIZONTAL' },
    { name: 'Auth modal / Create account', layout: 'HORIZONTAL' },
  ];
  const sets = {};
  for (const definition of definitions) {
    const existingSet = page.findOne(
      node => node.type === 'COMPONENT_SET' && node.name === definition.name,
    );
    if (existingSet) {
      const dark = existingSet.children.find(
        node => node.type === 'COMPONENT' && node.name.includes('Theme=Dark'),
      );
      if (!dark) throw new Error(`Missing Theme=Dark variant in ${definition.name}`);
      await applyDarkTheme(dark, darkTokens);
      sets[definition.name] = existingSet;
      continue;
    }
    const light = page.findOne(
      node => node.type === 'COMPONENT' && node.name === definition.name,
    );
    if (!light) continue;
    light.name = 'Theme=Light';
    const dark = light.clone();
    dark.name = 'Theme=Dark';
    await applyDarkTheme(dark, darkTokens);
    const set = figma.combineAsVariants([light, dark], page);
    set.name = definition.name;
    set.description = 'Switch Theme between Light and Dark from the component properties panel.';
    set.layoutMode = definition.layout;
    set.itemSpacing = 24;
    set.primaryAxisSizingMode = 'AUTO';
    set.counterAxisSizingMode = 'AUTO';
    sets[definition.name] = set;
  }
  return sets;
}

function iconTokenForHex(value) {
  const hex = value.toUpperCase();
  if (hex === '#FFFFFF') return 'color/text/inverse';
  if (hex === '#F4F7F5') return 'color/text/primary';
  if (hex === '#F7FAF8') return 'color/text/nav-active';
  if (['#1AA58E', '#138D7B', '#22B69A', '#23B69B', '#3DDBBD'].includes(hex)) return 'color/status/online';
  if (['#D94A4A', '#FF7B7B'].includes(hex)) return 'color/status/error';
  if (['#0EA5E9', '#0B8AC5', '#59BDF2'].includes(hex)) return 'color/status/info';
  if (['#65718A', '#69736F', '#8B9591', '#899690', '#B4BFC0', '#B7C2BD'].includes(hex)) return 'color/text/nav';
  return 'color/text/primary';
}

function bindVectorColors(root, tokenMap) {
  const colorHex = color => `#${[color.r, color.g, color.b]
    .map(value => Math.round(value * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
  for (const node of root.findAllWithCriteria({ types: ['VECTOR'] })) {
    if (Array.isArray(node.fills)) {
      node.fills = node.fills.map(fill => {
        if (fill.type !== 'SOLID') return fill;
        const tokenName = iconTokenForHex(colorHex(fill.color));
        return tokenMap[tokenName] ? bindPaint(tokenMap[tokenName], fill.opacity ?? 1) : fill;
      });
    }
    if (Array.isArray(node.strokes)) {
      node.strokes = node.strokes.map(stroke => {
        if (stroke.type !== 'SOLID') return stroke;
        const tokenName = iconTokenForHex(colorHex(stroke.color));
        return tokenMap[tokenName] ? bindPaint(tokenMap[tokenName], stroke.opacity ?? 1) : stroke;
      });
    }
  }
}

function sanitizeImportedSvgRoots(root) {
  const svgRootPattern = /(sparkle|compass|glyph|plus$|send arrow|show password|close icon|avatar person|account chevron|panel toggle)/i;
  for (const node of root.findAllWithCriteria({ types: ['FRAME'] })) {
    if (!svgRootPattern.test(node.name)) continue;
    node.fills = [];
    node.strokes = [];
  }
}

function bindAllIconColors(page, tokens, darkTokens) {
  sanitizeImportedSvgRoots(page);
  const components = page.findAllWithCriteria({ types: ['COMPONENT'] });
  for (const component of components) {
    sanitizeImportedSvgRoots(component);
    const dark = component.parent?.type === 'COMPONENT_SET' && component.name.includes('Theme=Dark');
    bindVectorColors(component, dark ? darkTokens : tokens);
  }
  for (const frame of page.children.filter(isStateFrame)) {
    bindVectorColors(frame, frame.name.includes('Dark mode') ? darkTokens : tokens);
  }
}

function auditThemeTokens(page, themeSets) {
  const results = [];
  let paintSlots = 0;
  let boundPaintSlots = 0;
  for (const [name, set] of Object.entries(themeSets)) {
    const themeValues = set.children
      .filter(node => node.type === 'COMPONENT')
      .map(node => node.name);
    let total = 0;
    let bound = 0;
    for (const node of [set, ...set.findAll(() => true)]) {
      for (const key of ['fills', 'strokes']) {
        if (!Array.isArray(node[key])) continue;
        const bindings = node.boundVariables?.[key];
        node[key].forEach((paint, index) => {
          if (paint.type !== 'SOLID') return;
          total += 1;
          if (Array.isArray(bindings) && bindings[index]) bound += 1;
        });
      }
    }
    paintSlots += total;
    boundPaintSlots += bound;
    results.push({
      name,
      themeValues,
      paintSlots: total,
      boundPaintSlots: bound,
      unboundPaintSlots: total - bound,
    });
  }
  return {
    themeSetCount: Object.keys(themeSets).length,
    paintSlots,
    boundPaintSlots,
    unboundPaintSlots: paintSlots - boundPaintSlots,
    coverage: paintSlots ? Math.round((boundPaintSlots / paintSlots) * 100) : 0,
    components: results,
  };
}

async function createWholeScreenThemeVariants(page, darkTokens, tokens, styles) {
  const existingPage = figma.root.children.find(node => node.name === 'MVP · Theme Screens');
  if (existingPage) {
    await claimLegacyThemePage(existingPage);
    if (!isOwned(existingPage)) {
      throw new Error(
        'A pre-existing "MVP · Theme Screens" page was found. Rename it before running the plugin.',
      );
    }
    existingPage.remove();
  }
  const darkSample = page.findOne(node => node.type === 'FRAME' && node.name === '08 / Dark mode — new chat');
  if (darkSample && isOwned(darkSample)) darkSample.remove();
  for (const node of [...page.children]) {
    if (isOwned(node) && node.type === 'COMPONENT_SET' && node.name.startsWith('Screen / ')) {
      node.remove();
    }
  }

  const stateFrames = page.children
    .filter(isStateFrame)
    .filter(node => !node.name.includes('Dark mode'));
  const masters = [];
  for (const [index, frame] of stateFrames.entries()) {
    const clone = frame.clone();
    clone.name = 'Theme=Light';
    const light = figma.createComponentFromNode(clone);
    light.name = 'Theme=Light';
    const dark = light.clone();
    dark.name = 'Theme=Dark';
    await applyDarkTheme(dark, darkTokens);
    const set = figma.combineAsVariants([light, dark], page);
    set.name = `Screen / ${frame.name.replace(/^\d{2}\s*\/\s*/, '')}`;
    set.description = 'Whole-screen state. Switch Theme in the right sidebar to preview Light or Dark mode.';
    set.layoutMode = 'VERTICAL';
    set.itemSpacing = 40;
    set.primaryAxisSizingMode = 'AUTO';
    set.counterAxisSizingMode = 'AUTO';
    set.x = 180;
    set.y = 9000 + index * 1900;
    const lightVariant = set.children.find(
      node => node.type === 'COMPONENT' && node.name.includes('Theme=Light'),
    );
    if (!lightVariant) throw new Error(`Missing light variant for ${set.name}`);
    masters.push({
      set,
      light: lightVariant,
      name: frame.name,
      x: frame.x,
      y: frame.y,
      source: frame,
    });
  }

  const flowInstances = [];
  for (const master of masters) {
    const instance = master.light.createInstance();
    page.appendChild(instance);
    instance.name = master.name;
    instance.x = master.x;
    instance.y = master.y;
    master.source.remove();
    flowInstances.push(instance);
  }

  const themePage = figma.createPage();
  themePage.name = 'MVP · Theme Screens';
  markOwned(themePage);
  await figma.setCurrentPageAsync(themePage);
  await addText(themePage, 'WHOLE-SCREEN VARIANTS', 160, 112, styles.label, bindPaint(tokens['color/text/tertiary']));
  await addText(themePage, 'Select a screen, then switch Theme in the right sidebar.', 160, 146, styles.display, bindPaint(tokens['color/text/primary']));
  await addText(
    themePage,
    'Each instance exposes Theme=Light / Theme=Dark while preserving its state.',
    160,
    198,
    styles.body,
    bindPaint(tokens['color/text/secondary']),
  );
  const instances = [];
  for (const [index, master] of masters.entries()) {
    const instance = master.light.createInstance();
    themePage.appendChild(instance);
    instance.name = master.name;
    instance.x = 160 + (index % 2) * 1520;
    instance.y = 300 + Math.floor(index / 2) * 980;
    instances.push(instance);
  }
  figma.currentPage.selection = instances.length ? [instances[0]] : [];
  if (instances.length) figma.viewport.scrollAndZoomIntoView([instances[0]]);
  return {
    page: themePage,
    instances,
    flowInstances,
    masterCount: masters.length,
  };
}

function removeCustomLabels(page) {
  if (!isOwned(page)) return;
  for (const node of [...page.children]) {
    if (node.type !== 'TEXT') continue;
    if (
      ROW_PATTERN.test(node.name) ||
      /^(Sidebar|Composer|Auth field|Button|Auth modal)\s*\//.test(node.name)
    ) {
      node.remove();
    }
  }
}

async function loadAndFixText(page) {
  const textNodes = page.findAllWithCriteria({ types: ['TEXT'] });
  await loadFontsForNodes(textNodes);
  for (const node of textNodes) {
    if (node.textAutoResize !== 'WIDTH_AND_HEIGHT') node.textAutoResize = 'HEIGHT';
    if (node.characters === 'Sign in to save trips') node.characters = 'Save your trips';
  }
  return textNodes.length;
}

function fixStateHeaders(page) {
  const headers = page.findAllWithCriteria({ types: ['FRAME'] }).filter(node => node.name === 'Header');
  for (const header of headers) {
    const title = header.children.find(node => node.type === 'FRAME' && node.name === 'Header title');
    if (title) title.layoutSizingHorizontal = 'FILL';
    const spacer = header.children.find(node => node.name === 'Spacer');
    if (spacer) spacer.visible = false;
  }
  return headers.length;
}

function fixConversations(page) {
  const bodies = page.findAllWithCriteria({ types: ['FRAME'] }).filter(node => node.name === 'Conversation body');
  for (const body of bodies) {
    body.primaryAxisAlignItems = 'MIN';
    body.paddingTop = 48;
  }
  const answer = page.findOne(node => node.type === 'FRAME' && node.name === 'Conversation' && node.height > 400);
  if (answer) answer.resize(720, 540);
  const itinerary = page.findOne(node => node.type === 'FRAME' && node.name === 'Itinerary summary');
  if (itinerary) itinerary.resize(720, 266);
  return bodies.length;
}

async function replaceLoadingComponent(page, tokens, styles) {
  const rows = page.findAllWithCriteria({ types: ['FRAME'] }).filter(node => node.name === 'Assistant waiting');
  let updated = 0;
  for (const row of rows) {
    const old = row.children.find(node => node.name === 'Planning status');
    if (old) old.remove();
    const loading = createAuto(row, 'Loading / inline', 'HORIZONTAL', 230, 32);
    loading.counterAxisAlignItems = 'CENTER';
    loading.itemSpacing = 8;
    await addText(loading, 'Planning your trip', 0, 0, styles.bodySmall, bindPaint(tokens['color/text/secondary']), { name: 'Loading label' });
    for (let index = 0; index < 3; index += 1) {
      const dot = figma.createEllipse();
      loading.appendChild(dot);
      dot.name = `Loading dot ${index + 1}`;
      dot.resize(5, 5);
      dot.fills = [bindPaint(tokens['color/text/tertiary'])];
    }
    updated += 1;
  }
  const waitingComposer = page.findOne(node => node.type === 'COMPONENT' && node.name === 'Composer / Waiting');
  const placeholder = waitingComposer?.findOne(node => node.type === 'TEXT' && node.name === 'Placeholder');
  if (placeholder) {
    await loadFontsForNodes([placeholder]);
    placeholder.characters = 'Planning your trip…';
  }
  return updated;
}

async function createAuthFieldVariants(page, tokens, styles) {
  for (const node of [...page.children]) {
    if (
      isOwned(node) &&
      (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') &&
      AUTH_FIELD_COMPONENT_NAMES.has(node.name)
    ) {
      node.remove();
    }
  }
  const makeField = async (name, x, y, value, borderToken, password = false) => {
    const component = figma.createComponent();
    page.appendChild(component);
    component.name = name;
    component.x = x;
    component.y = y;
    component.resize(344, 44);
    component.fills = [bindPaint(tokens['color/bg/surface'])];
    component.strokes = [bindPaint(tokens[borderToken])];
    component.strokeWeight = borderToken === 'color/status/error' ? 1.5 : 1;
    component.cornerRadius = 10;
    component.layoutMode = 'HORIZONTAL';
    component.primaryAxisSizingMode = 'FIXED';
    component.counterAxisSizingMode = 'FIXED';
    component.paddingLeft = 12;
    component.paddingRight = 12;
    component.counterAxisAlignItems = 'CENTER';
    component.itemSpacing = 8;
    const valueNode = await addText(
      component,
      value,
      0,
      0,
      styles.bodySmall,
      bindPaint(value === 'Email address' || value === 'Your name' ? tokens['color/text/tertiary'] : tokens['color/text/primary']),
      { name: 'Value', width: password ? 270 : 304 },
    );
    valueNode.layoutSizingHorizontal = 'FILL';
    if (password) {
      addSvg(component, 'Show password', 0, 0, 16, '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M1.5 8C3.4 4.9 5.5 3.5 8 3.5C10.5 3.5 12.6 4.9 14.5 8C12.6 11.1 10.5 12.5 8 12.5C5.5 12.5 3.4 11.1 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>', tokens['color/text/nav']);
    }
    return component;
  };
  const defaultField = await makeField('Auth / Text Field / Default', 220, 4600, 'Email address', 'color/border/default');
  const filled = await makeField('Auth / Text Field / Filled', 624, 4600, 'jamie@roamwise.app', 'color/border/default');
  const password = await makeField('Auth / Text Field / Password', 1028, 4600, '••••••••', 'color/border/default', true);
  const error = await makeField('Auth / Text Field / Error', 220, 4680, 'jamie@', 'color/status/error');
  return { defaultField, filled, password, error };
}

async function fieldGroup(parent, label, styles, tokens, fieldComponent, options = {}) {
  const group = createAuto(parent, `Field / ${label}`, 'VERTICAL', 344, 70);
  group.itemSpacing = 4;
  group.primaryAxisSizingMode = 'AUTO';
  group.counterAxisSizingMode = 'FIXED';
  const labelNode = await addText(group, label, 0, 0, styles.caption, bindPaint(tokens['color/text/secondary']), {
    name: `Label / ${label}`,
    width: 344,
  });
  labelNode.layoutSizingHorizontal = 'FILL';
  const instance = fieldComponent.createInstance();
  group.appendChild(instance);
  instance.resize(344, 44);
  instance.layoutSizingHorizontal = 'FILL';
  const valueNode = instance.findOne(node => node.type === 'TEXT' && node.name === 'Value');
  if (valueNode && options.value !== undefined) {
    await loadFontsForNodes([valueNode]);
    valueNode.characters = options.value;
  }
  if (options.helper) {
    const helper = await addText(
      group,
      options.helper,
      0,
      0,
      styles.caption,
      bindPaint(tokens[options.error ? 'color/status/error' : 'color/text/tertiary']),
      { name: options.error ? 'Validation error' : 'Field helper', width: 344 },
    );
    helper.layoutSizingHorizontal = 'FILL';
  }
  return group;
}

async function createAuthModal(page, tokens, styles, kind, fieldVariants, x, y) {
  const component = figma.createComponent();
  page.appendChild(component);
  component.name = kind === 'signIn' ? 'Auth modal / Sign in' : 'Auth modal / Create account';
  component.x = x;
  component.y = y;
  component.resize(400, 120);
  component.fills = [bindPaint(tokens['color/bg/surface'])];
  component.cornerRadius = 20;
  component.strokes = [bindPaint(tokens['color/border/subtle'])];
  component.strokeWeight = 1;
  component.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0.047, g: 0.082, b: 0.071, a: 0.12 },
    offset: { x: 0, y: 14 },
    radius: 34,
    spread: -8,
    visible: true,
    blendMode: 'NORMAL',
  }];
  component.layoutMode = 'VERTICAL';
  component.paddingLeft = 28;
  component.paddingRight = 28;
  component.paddingTop = 28;
  component.paddingBottom = 28;
  component.itemSpacing = 18;
  component.counterAxisSizingMode = 'FIXED';
  component.primaryAxisSizingMode = 'AUTO';

  const head = createAuto(component, 'Modal header', 'HORIZONTAL', 344, 40);
  head.layoutSizingHorizontal = 'FILL';
  head.counterAxisAlignItems = 'CENTER';
  head.itemSpacing = 10;
  logo(head, tokens, 0, 0, 38);
  const spacer = createAuto(head, 'Spacer', 'HORIZONTAL', 1, 1);
  spacer.layoutSizingHorizontal = 'FILL';
  const close = createFrame(head, 'Close button', 0, 0, 32, 32, {
    fill: bindPaint(tokens['color/bg/muted']),
    radius: 8,
  });
  addSvg(close, 'Close icon', 8, 8, 16, '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3L13 13M13 3L3 13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>', tokens['color/text/nav']);

  const titleStack = createAuto(component, 'Modal title group', 'VERTICAL', 344, 70);
  titleStack.layoutSizingHorizontal = 'FILL';
  titleStack.primaryAxisSizingMode = 'AUTO';
  titleStack.counterAxisSizingMode = 'FIXED';
  titleStack.itemSpacing = 6;
  const title = await addText(
    titleStack,
    kind === 'signIn' ? 'Welcome back' : 'Create your account',
    0,
    0,
    styles.heading,
    bindPaint(tokens['color/text/primary']),
    { name: 'Modal title', width: 344 },
  );
  title.layoutSizingHorizontal = 'FILL';
  const description = await addText(
    titleStack,
    kind === 'signIn'
      ? 'Sign in with your roamwise account. Your trips stay synced across devices.'
      : 'Use your email to save trips and continue planning anywhere.',
    0,
    0,
    styles.body,
    bindPaint(tokens['color/text/secondary']),
    { name: 'Modal description', width: 344 },
  );
  description.layoutSizingHorizontal = 'FILL';

  const form = createAuto(component, 'Modal form', 'VERTICAL', 344, 170);
  form.layoutSizingHorizontal = 'FILL';
  form.primaryAxisSizingMode = 'AUTO';
  form.counterAxisSizingMode = 'FIXED';
  form.itemSpacing = 16;
  const fields = kind === 'signIn'
    ? [
        ['Email address', fieldVariants.filled, { value: 'jamie@roamwise.app', helper: 'Use the email linked to your account.' }],
        ['Password', fieldVariants.password, { value: '••••••••', helper: '8+ characters with at least one number.' }],
      ]
    : [
        ['Full name', fieldVariants.defaultField, { value: 'Your name' }],
        ['Email address', fieldVariants.error, { value: 'jamie@', helper: 'Enter a valid email like name@example.com.', error: true }],
        ['Password', fieldVariants.defaultField, { value: 'At least 8 characters', helper: 'Use 8+ characters, including a letter and a number.' }],
      ];
  for (const [label, field, options] of fields) {
    const group = await fieldGroup(form, label, styles, tokens, field, options);
    group.layoutSizingHorizontal = 'FILL';
  }

  if (kind === 'signIn') {
    const forgot = await addText(component, 'Forgot password?', 0, 0, styles.caption, bindPaint(tokens['color/text/brand']), {
      name: 'Forgot password',
      width: 344,
      align: 'RIGHT',
    });
    forgot.layoutSizingHorizontal = 'FILL';
  } else {
    const termsRow = createAuto(component, 'Terms row', 'HORIZONTAL', 344, 24);
    termsRow.layoutSizingHorizontal = 'FILL';
    termsRow.counterAxisAlignItems = 'CENTER';
    termsRow.itemSpacing = 8;
    const checkbox = figma.createRectangle();
    termsRow.appendChild(checkbox);
    checkbox.name = 'Terms checkbox';
    checkbox.resize(18, 18);
    checkbox.cornerRadius = 4;
    checkbox.fills = [bindPaint(tokens['color/bg/surface'])];
    checkbox.strokes = [bindPaint(tokens['color/border/default'])];
    checkbox.strokeWeight = 1;
    const terms = await addText(termsRow, 'I agree to the Terms and Privacy Policy', 0, 0, styles.caption, bindPaint(tokens['color/text/secondary']), {
      name: 'Terms',
    });
    terms.layoutSizingHorizontal = 'FILL';
  }

  const primary = findLightComponent(page, 'Button / Primary');
  if (!primary) throw new Error('Primary button component is missing.');
  const button = primary.createInstance();
  component.appendChild(button);
  button.resize(344, 42);
  button.layoutSizingHorizontal = 'FILL';
  const buttonLabel = button.findOne(node => node.type === 'TEXT' && node.name === 'Label');
  if (buttonLabel) {
    await loadFontsForNodes([buttonLabel]);
    buttonLabel.characters = kind === 'signIn' ? 'Sign in' : 'Create account';
  }

  const footer = await addText(
    component,
    kind === 'signIn' ? 'New to roamwise? Create an account' : 'Already have an account? Sign in',
    0,
    0,
    styles.bodySmall,
    bindPaint(tokens['color/text/secondary']),
    { name: 'Modal footer', width: 344, align: 'CENTER' },
  );
  footer.layoutSizingHorizontal = 'FILL';
  return component;
}

async function rebuildAuthModals(page, tokens, styles) {
  const stateFrames = page.children.filter(isStateFrame);
  const overlays = [];
  for (const frame of stateFrames) {
    if (!frame.name.includes('Signed out')) continue;
    const overlay = frame.children.find(node => node.type === 'FRAME' && node.name === 'Modal scrim');
    if (!overlay) continue;
    for (const child of [...overlay.children]) {
      if (child.type === 'INSTANCE' && child.name.startsWith('Auth modal /')) child.remove();
    }
    overlay.fills = [bindPaint(tokens['color/text/primary'], 0.08)];
    overlays.push({ frame, overlay, kind: frame.name.includes('create account') ? 'signUp' : 'signIn' });
  }
  for (const node of [...page.children]) {
    if (
      isOwned(node) &&
      (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') &&
      AUTH_MODAL_COMPONENT_NAMES.has(node.name)
    ) {
      node.remove();
    }
  }
  const fieldVariants = await createAuthFieldVariants(page, tokens, styles);
  const primary = findLightComponent(page, 'Button / Primary');
  if (primary) {
    primary.resize(344, 42);
    primary.layoutSizingHorizontal = 'FIXED';
    const primarySet = primary.parent?.type === 'COMPONENT_SET' ? primary.parent : null;
    if (primarySet) {
      for (const variant of primarySet.children) {
        if (variant.type === 'COMPONENT') variant.resize(344, 42);
      }
    }
  }
  const signIn = await createAuthModal(page, tokens, styles, 'signIn', fieldVariants, 220, 4800);
  const signUp = await createAuthModal(page, tokens, styles, 'signUp', fieldVariants, 704, 4800);
  for (const item of overlays) {
    const modal = (item.kind === 'signUp' ? signUp : signIn).createInstance();
    item.overlay.appendChild(modal);
    modal.x = (1440 - modal.width) / 2;
    modal.y = (900 - modal.height) / 2;
  }
  return { signIn, signUp, fieldVariants, overlayCount: overlays.length };
}

function arrangeComponentArea(page) {
  const board = page.findOne(node => node.type === 'FRAME' && node.name === 'Components / MVP board');
  if (!board) return;
  board.resize(1440, 3800);
  const place = (name, x, y) => {
    const node = page.findOne(
      item => (item.type === 'COMPONENT' || item.type === 'COMPONENT_SET') && item.name === name,
    );
    if (!node) return;
    node.x = x;
    node.y = y;
  };
  place('Sidebar / Workspace / Signed in', 220, 3610);
  place('Sidebar / Workspace / Signed out', 800, 3610);
  place('Composer / Empty', 220, 4600);
  place('Composer / Typing', 220, 4780);
  place('Composer / Waiting', 220, 4960);
  place('Auth / Text Field / Default', 220, 5160);
  place('Auth / Text Field / Filled', 624, 5160);
  place('Auth / Text Field / Password', 1028, 5160);
  place('Auth / Text Field / Error', 220, 5320);
  place('Button / Primary', 624, 5320);
  place('Auth modal / Sign in', 220, 5500);
  place('Auth modal / Create account', 220, 6100);
}

async function createTokenBoard(page, tokens, styles, darkTokens, audit) {
  const previous = page.findOne(node => node.type === 'FRAME' && node.name === TOKEN_BOARD_NAME);
  if (previous) {
    if (!isOwned(previous)) {
      throw new Error(
        `A pre-existing "${TOKEN_BOARD_NAME}" frame is not plugin-owned. Rename it before continuing.`,
      );
    }
    previous.remove();
  }
  const board = createFrame(page, TOKEN_BOARD_NAME, 3240, 300, 1440, 1760, {
    fill: bindPaint(tokens['color/bg/canvas']),
    radius: 16,
    clip: true,
  });
  const fill = name => bindPaint(tokens[name]);
  await addText(board, 'DESIGN TOKENS', 40, 38, styles.label, fill('color/text/tertiary'));
  await addText(board, 'roamwise / Travel Chat MVP', 40, 72, styles.display, fill('color/text/primary'));
  await addText(
    board,
    'The semantic layer now covers the workspace navigation introduced in this revision. Figma Variables remain the implementation source of truth.',
    40,
    126,
    styles.body,
    fill('color/text/secondary'),
    { width: 760 },
  );
  const darkFill = name => bindPaint(darkTokens[name]);
  const darkPreview = createFrame(board, 'Dark mode UI preview', 1030, 82, 350, 270, {
    fill: darkFill('color/bg/canvas'),
    radius: 16,
    clip: true,
  });
  const darkSidebar = figma.createRectangle();
  darkPreview.appendChild(darkSidebar);
  darkSidebar.name = 'Dark sidebar';
  darkSidebar.resize(82, 270);
  darkSidebar.fills = [darkFill('color/bg/sidebar')];
  const darkLogo = figma.createRectangle();
  darkPreview.appendChild(darkLogo);
  darkLogo.name = 'Dark logo';
  darkLogo.resize(36, 36);
  darkLogo.x = 23;
  darkLogo.y = 22;
  darkLogo.cornerRadius = 11;
  darkLogo.fills = [darkFill('color/bg/brand-tile')];
  await addText(darkPreview, 'DARK MODE', 108, 24, styles.caption, darkFill('color/text/nav'));
  await addText(darkPreview, 'Where should we go?', 108, 58, styles.title, darkFill('color/text/primary'));
  await addText(darkPreview, 'A calm, low-transfer route through Kyoto.', 108, 96, styles.bodySmall, darkFill('color/text/secondary'), { width: 210 });
  const darkCard = createFrame(darkPreview, 'Dark assistant card', 108, 138, 214, 72, {
    fill: darkFill('color/bg/surface'),
    stroke: darkFill('color/border/subtle'),
    radius: 12,
  });
  await addText(darkCard, 'Five calm days', 14, 12, styles.label, darkFill('color/text/primary'));
  await addText(darkCard, 'Kyoto · one hotel · 5 stops', 14, 38, styles.caption, darkFill('color/text/secondary'));
  const darkInput = createFrame(darkPreview, 'Dark composer', 108, 226, 214, 30, {
    fill: darkFill('color/bg/surface'),
    stroke: darkFill('color/border/default'),
    radius: 15,
  });
  await addText(darkInput, 'Message your travel planner…', 12, 7, styles.caption, darkFill('color/text/tertiary'));
  await addText(board, 'Theme architecture', 1030, 382, styles.title, fill('color/text/primary'));
  await addText(
    board,
    `${audit.themeSetCount} Light/Dark component sets · ${audit.boundPaintSlots}/${audit.paintSlots} paint roles bound to tokens · ${audit.coverage}% coverage`,
    1030,
    416,
    styles.bodySmall,
    fill('color/text/secondary'),
    { width: 350 },
  );
  await addText(
    board,
    `${audit.unboundPaintSlots} unbound paints remain, primarily inside imported icon SVGs.`,
    1030,
    466,
    styles.caption,
    fill('color/text/tertiary'),
    { width: 350 },
  );
  const section = (label, y) => addText(board, label, 40, y, styles.title, fill('color/text/primary'));
  const swatches = [
    ['Canvas', 'color/bg/canvas', 'color/bg/canvas'],
    ['Surface', 'color/bg/surface', 'color/bg/surface'],
    ['Nav selected', 'color/bg/nav-active', 'color/bg/nav-active'],
    ['Brand tile', 'color/bg/brand-tile', 'color/bg/brand-tile'],
    ['Action', 'color/action/primary', 'color/action/primary'],
    ['Text primary', 'color/text/primary', 'color/text/primary'],
    ['Nav text', 'color/text/nav', 'color/text/nav'],
    ['Nav selected text', 'color/text/nav-active', 'color/text/nav-active'],
    ['Online', 'color/status/online', 'color/status/online'],
  ];
  await section('Color / semantic', 214);
  for (const [index, swatchSpec] of swatches.entries()) {
    const x = 40 + (index % 3) * 320;
    const y = 258 + Math.floor(index / 3) * 130;
    const card = createFrame(board, `Token card / ${swatchSpec[0]}`, x, y, 288, 104, {
      fill: fill('color/bg/surface'),
      stroke: fill('color/border/subtle'),
      radius: 12,
    });
    const swatch = figma.createRectangle();
    card.appendChild(swatch);
    swatch.name = `Swatch / ${swatchSpec[0]}`;
    swatch.resize(56, 56);
    swatch.x = 16;
    swatch.y = 16;
    swatch.cornerRadius = 9;
    swatch.fills = [fill(swatchSpec[1])];
    swatch.strokes = [fill('color/border/subtle')];
    swatch.strokeWeight = 1;
    await addText(card, swatchSpec[0], 88, 18, styles.label, fill('color/text/primary'));
    await addText(card, swatchSpec[2], 88, 44, styles.caption, fill('color/text/tertiary'), { width: 184 });
  }

  await section('Spacing', 660);
  let spacingX = 40;
  for (const spacing of [4, 8, 12, 16, 24, 32, 48]) {
    const width = Math.max(spacing * 1.6, 20);
    await addText(board, String(spacing), spacingX, 704, styles.caption, fill('color/text/tertiary'));
    const bar = figma.createRectangle();
    board.appendChild(bar);
    bar.name = `Spacing / ${spacing}`;
    bar.resize(width, 12);
    bar.x = spacingX;
    bar.y = 730;
    bar.cornerRadius = 6;
    bar.fills = [fill('color/action/primary')];
    spacingX += Math.max(width, 42) + 24;
  }

  await section('Radius', 800);
  const radiusSpecs = [{ name: 'sm', radius: 8 }, { name: 'md', radius: 12 }, { name: 'lg', radius: 16 }, { name: 'xl', radius: 24 }, { name: 'full', radius: 999 }];
  for (const [index, spec] of radiusSpecs.entries()) {
    const x = 40 + index * 164;
    const tile = createFrame(board, `Radius / ${spec.name}`, x, 846, 136, 104, {
      fill: fill('color/bg/surface'),
      stroke: fill('color/border/subtle'),
      radius: spec.radius,
    });
    await addText(tile, spec.name, 16, 16, styles.label, fill('color/text/primary'));
    await addText(tile, spec.radius === 999 ? 'full' : `${spec.radius}px`, 16, 54, styles.caption, fill('color/text/tertiary'));
  }

  await section('Typography', 1000);
  const typeSpecs = [
    ['Display', 'display', '32 / 40 · Semibold'],
    ['Heading', 'heading', '24 / 32 · Semibold'],
    ['Title', 'title', '20 / 28 · Semibold'],
    ['Body', 'body', '16 / 26 · Regular'],
    ['Body small', 'bodySmall', '14 / 22 · Regular'],
    ['Label', 'label', '14 / 20 · Semibold'],
    ['Caption', 'caption', '12 / 18 · Regular'],
  ];
  for (const [index, spec] of typeSpecs.entries()) {
    const y = 1048 + index * 66;
    await addText(board, spec[0], 40, y, styles.label, fill('color/text/tertiary'), { width: 140 });
    await addText(board, 'Make room for wonder.', 180, y - 2, styles[spec[1]], fill('color/text/primary'));
    await addText(board, spec[2], 730, y + 4, styles.caption, fill('color/text/tertiary'));
  }

  await section('Effects', 1530);
  const shadowCard = createFrame(board, 'Shadow / soft', 40, 1578, 300, 112, {
    fill: fill('color/bg/surface'),
    radius: 16,
  });
  shadowCard.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0.047, g: 0.082, b: 0.071, a: 0.10 },
    offset: { x: 0, y: 8 },
    radius: 24,
    spread: -6,
    visible: true,
    blendMode: 'NORMAL',
  }];
  await addText(shadowCard, 'Shadow / soft', 20, 22, styles.label, fill('color/text/primary'));
  await addText(shadowCard, '0 8 24 -6 · 10% ink', 20, 54, styles.caption, fill('color/text/tertiary'));
  return board;
}

async function updateLegacyBrandIcon() {
  await figma.loadAllPagesAsync();
  let brand = null;
  let page = null;
  for (const candidate of figma.root.children) {
    const brandText = candidate.findAllWithCriteria({ types: ['TEXT'] }).find(
      node => node.characters.trim().toLowerCase() === 'roamwise',
    );
    if (
      brandText?.parent?.type === 'FRAME' &&
      brandText.parent.name === 'Group'
    ) {
      brand = brandText.parent;
      page = candidate;
      break;
    }
  }
  if (!brand || !page) return { updated: false, reason: 'roamwise brand group not found' };
  await figma.setCurrentPageAsync(page);
  const previous = brand.findOne(node => node.name === BRAND_TOGGLE_NAME);
  if (previous) {
    if (!isOwned(previous)) markOwned(previous);
    previous.remove();
  }
  const oldIcon = brand.children.find(
    node => node.type === 'VECTOR' && node.x > brand.width - 30 && node.width <= 8,
  );
  if (oldIcon) oldIcon.remove();
  const button = figma.createFrame();
  brand.appendChild(button);
  button.name = BRAND_TOGGLE_NAME;
  markOwned(button);
  button.resize(24, 24);
  button.x = 151;
  button.y = 5;
  button.cornerRadius = 8;
  button.fills = [solid('#F1F3F2')];
  button.strokes = [solid('#E7EBE8')];
  button.strokeWeight = 1;
  button.strokeAlign = 'INSIDE';
  const icon = figma.createNodeFromSvg(
    '<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="1" y="2" width="12" height="10" rx="2" fill="none" stroke="#3A4541" stroke-width="1.2"/>' +
      '<path d="M5 2V12M9 5L7 7L9 9" fill="none" stroke="#3A4541" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',
  );
  icon.fills = [];
  icon.strokes = [];
  button.appendChild(icon);
  icon.name = 'Panel toggle icon';
  icon.x = 5;
  icon.y = 5;
  icon.resize(14, 14);
  return { updated: true, pageId: page.id, brandId: brand.id, buttonId: button.id, iconId: icon.id };
}

async function run() {
  const mvpPage = figma.root.children.find(node => node.name === MVP_PAGE_NAME);
  if (!mvpPage) throw new Error('The MVP · Travel Chat page does not exist.');
  await figma.setCurrentPageAsync(mvpPage);
  claimLegacyMvpPage(mvpPage);
  if (!isOwned(mvpPage)) {
    throw new Error(
      'The MVP · Travel Chat page is not marked as plugin-owned. Duplicate it before applying this repair.',
    );
  }
  markOwned(mvpPage);
  await restoreStateFramesIfNeeded(mvpPage);
  await loadFonts([
    { family: 'Inter', style: 'Regular' },
    { family: 'Inter', style: 'Medium' },
    { family: 'Inter', style: 'Semi Bold' },
    { family: 'Inter', style: 'Bold' },
  ]);
  const tokens = await ensureDesignTokens();
  const darkTokens = await ensureDarkTokens();
  const styles = await getTextStyles();

  removeCustomLabels(mvpPage);
  const componentBoard = mvpPage.findOne(node => node.type === 'FRAME' && node.name === 'Components / MVP board');
  if (componentBoard) componentBoard.resize(1440, 3800);
  const textCount = await loadAndFixText(mvpPage);
  const headerCount = fixStateHeaders(mvpPage);
  const conversationCount = fixConversations(mvpPage);
  const loadingCount = await replaceLoadingComponent(mvpPage, tokens, styles);
  const sidebarResult = await replaceSidebars(mvpPage, tokens, styles);
  const authResult = await rebuildAuthModals(mvpPage, tokens, styles);
  const themeSets = await createThemeVariantSets(mvpPage, darkTokens);
  bindAllIconColors(mvpPage, tokens, darkTokens);
  const tokenAudit = auditThemeTokens(mvpPage, themeSets);
  arrangeComponentArea(mvpPage);
  const collapsed = await rebuildCollapsedState(mvpPage, tokens, styles);
  const tokenBoard = await createTokenBoard(mvpPage, tokens, styles, darkTokens, tokenAudit);
  const screenThemes = await createWholeScreenThemeVariants(mvpPage, darkTokens, tokens, styles);
  const brandResult = await updateLegacyBrandIcon();

  await figma.setCurrentPageAsync(mvpPage);
  figma.currentPage.selection = screenThemes.flowInstances.length ? [screenThemes.flowInstances[0]] : [];
  if (screenThemes.flowInstances.length) {
    figma.viewport.scrollAndZoomIntoView([screenThemes.flowInstances[0]]);
  }
  return {
    success: true,
    textCount,
    headerCount,
    conversationCount,
    loadingCount,
    sidebarCount: sidebarResult.targetCount,
    authOverlayCount: authResult.overlayCount,
    collapsedStateId: collapsed.id,
    darkTokenCount: Object.keys(darkTokens).length,
    themeSetCount: tokenAudit.themeSetCount,
    tokenCoverage: tokenAudit.coverage,
    boundPaintSlots: tokenAudit.boundPaintSlots,
    paintSlots: tokenAudit.paintSlots,
    tokenBoardId: tokenBoard.id,
    themeScreensPageId: screenThemes.page.id,
    wholeScreenVariantCount: screenThemes.masterCount,
    brandResult,
  };
}

figma.showUI(__html__, {
  width: 360,
  height: 430,
  themeColors: true,
  title: 'roamwise MVP Finish',
});

figma.ui.onmessage = async message => {
  if (message.type !== 'run') return;
  try {
    const result = await run();
    figma.ui.postMessage({ type: 'done', result });
    figma.notify('roamwise MVP states, loading UI, workspace sidebar, and tokens are ready.', { timeout: 5000 });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({ type: 'error', text });
    figma.notify(`MVP finish failed: ${text}`, { error: true, timeout: 8000 });
  }
};

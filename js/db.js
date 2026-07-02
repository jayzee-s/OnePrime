const SUPABASE_URL = 'https://icgastzexesrgfuqzdsq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u7IN2YFoU_JHAnpG0hStLw_7uA0LX_-';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== ROW MAPPERS =====
// Supabase 用 snake_case，JS 用 camelCase，在这里统一转换。
// 只要改这里，其余代码完全不需要关心数据库字段名。

function rowToProduct(r) {
  return {
    id: r.id,
    name: r.name,
    nameEn: r.name_en || '',
    cat: r.cat,
    price: Number(r.price),
    origPrice: r.orig_price != null ? Number(r.orig_price) : null,
    desc: r.desc_text || '',
    stock: r.stock || 0,
    active: r.active !== false,
    img: r.img_url || '',
  };
}
function productToRow(p) {
  return {
    id: p.id,
    name: p.name,
    name_en: p.nameEn || null,
    cat: p.cat,
    price: p.price,
    orig_price: p.origPrice || null,
    desc_text: p.desc || '',
    stock: p.stock || 0,
    active: p.active !== false,
    img_url: p.img || null,
  };
}

function rowToOrder(r) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    items: r.items || [],
    total: Number(r.total),
    status: r.status,
    address: r.address || '',
    phone: r.phone || '',
    isDemo: r.is_demo || false,
    createdAt: r.created_at,
  };
}
function orderToRow(o) {
  return {
    id: o.id,
    user_id: o.userId || null,
    user_name: o.userName,
    items: o.items,
    total: o.total,
    status: o.status || 'processing',
    address: o.address || '',
    phone: o.phone || '',
    is_demo: o.isDemo || false,
    created_at: o.createdAt || new Date().toISOString(),
  };
}

function rowToUser(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    provider: r.provider,
    role: r.role || 'customer',
    membership: r.membership || null,
    membershipSince: r.membership_since || null,
    active: r.active !== false,
    createdAt: r.created_at,
  };
}
function userToRow(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    provider: u.provider || 'email',
    role: u.role || 'customer',
    membership: u.membership || null,
    membership_since: u.membershipSince || null,
    active: u.active !== false,
    created_at: u.createdAt || new Date().toISOString(),
  };
}

// ===== 商品 =====
async function dbGetProducts() {
  const { data, error } = await db.from('products').select('*').order('id');
  if (error) { console.error('dbGetProducts:', error); return []; }
  return (data || []).map(rowToProduct);
}
async function dbSaveProduct(prod) {
  const { data, error } = await db.from('products').upsert(productToRow(prod)).select();
  if (error) { console.error('dbSaveProduct:', error); throw error; }
  return data?.[0] ? rowToProduct(data[0]) : null;
}
async function dbDeleteProduct(id) {
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) { console.error('dbDeleteProduct:', error); throw error; }
}
async function dbDeleteProducts(ids) {
  const { error } = await db.from('products').delete().in('id', ids);
  if (error) { console.error('dbDeleteProducts:', error); throw error; }
}
async function dbSetProductsActive(ids, active) {
  const { error } = await db.from('products').update({ active }).in('id', ids);
  if (error) { console.error('dbSetProductsActive:', error); throw error; }
}

// ===== 订单 =====
async function dbGetOrders() {
  const { data, error } = await db.from('orders').select('*').order('created_at', { ascending: false });
  if (error) { console.error('dbGetOrders:', error); return []; }
  return (data || []).map(rowToOrder);
}
async function dbSaveOrder(order) {
  const { error } = await db.from('orders').upsert(orderToRow(order));
  if (error) { console.error('dbSaveOrder:', error); throw error; }
}
async function dbUpdateOrderStatus(id, status) {
  const { error } = await db.from('orders').update({ status }).eq('id', id);
  if (error) { console.error('dbUpdateOrderStatus:', error); throw error; }
}
async function dbUpdateOrdersStatus(ids, status) {
  const { error } = await db.from('orders').update({ status }).in('id', ids);
  if (error) { console.error('dbUpdateOrdersStatus:', error); throw error; }
}
async function dbDeleteOrders(ids) {
  const { error } = await db.from('orders').delete().in('id', ids);
  if (error) { console.error('dbDeleteOrders:', error); throw error; }
}

// ===== 用户 =====
async function dbGetUsers() {
  const { data, error } = await db.from('users').select('*').order('created_at');
  if (error) { console.error('dbGetUsers:', error); return []; }
  return (data || []).map(rowToUser);
}
async function dbSaveUser(user) {
  const { error } = await db.from('users').upsert(userToRow(user));
  if (error) { console.error('dbSaveUser:', error); throw error; }
}
async function dbDeleteUsers(ids) {
  const { error } = await db.from('users').delete().in('id', ids);
  if (error) { console.error('dbDeleteUsers:', error); throw error; }
}

// ===== 图片上传 =====
async function dbUploadImage(file) {
  const fileName = Date.now() + '_' + file.name.replace(/\s/g, '_');
  const { error } = await db.storage
    .from('product-images')
    .upload(fileName, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = db.storage
    .from('product-images')
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}
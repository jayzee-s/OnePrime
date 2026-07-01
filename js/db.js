const SUPABASE_URL = 'https://icgastzexesrgfuqzdsq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u7IN2YFoU_JHAnpG0hStLw_7uA0LX_-';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== 商品 =====
async function dbGetProducts() {
  const { data } = await db.from('products').select('*').order('id');
  return data || [];
}
async function dbSaveProduct(prod) {
  // upsert = 有就更新，没有就插入
  const { data } = await db.from('products').upsert(prod).select();
  return data?.[0];
}
async function dbDeleteProduct(id) {
  await db.from('products').delete().eq('id', id);
}

// ===== 订单 =====
async function dbGetOrders() {
  const { data } = await db.from('orders').select('*').order('created_at', { ascending: false });
  return data || [];
}
async function dbSaveOrder(order) {
  await db.from('orders').upsert(order);
}
async function dbUpdateOrderStatus(id, status) {
  await db.from('orders').update({ status }).eq('id', id);
}

// ===== 用户 =====
async function dbGetUsers() {
  const { data } = await db.from('users').select('*').order('created_at');
  return data || [];
}
async function dbSaveUser(user) {
  await db.from('users').upsert(user);
}

// ===== 图片上传 =====
async function dbUploadImage(file) {
  const fileName = Date.now() + '_' + file.name.replace(/\s/g, '_');
  const { data, error } = await db.storage
    .from('product-images')
    .upload(fileName, file, { upsert: true });
  if (error) throw error;
  // 返回可以直接放进 <img src=""> 的公开 URL
  const { data: urlData } = db.storage
    .from('product-images')
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}

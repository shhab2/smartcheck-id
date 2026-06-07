// ضع هنا بيانات Supabase التي حفظتها
const SUPABASE_URL = "https://akkdcwaervshlieqpsiu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rQzB3PgFgXUkKArupOOm8w_tsq0EeXx";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentProfile = null;

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');

function resetSections() {
  ['authSection','pendingSection','blockedSection','appSection','adminSection'].forEach(hide);
}

function isValidIsraeliId(value) {
  let id = String(value).replace(/\D/g, '');
  if (!id || id.length > 9) return false;
  id = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let num = Number(id[i]) * ((i % 2) + 1);
    if (num > 9) num -= 9;
    sum += num;
  }
  return sum % 10 === 0;
}

async function signUp() {
  const email = $('emailInput').value.trim();
  const password = $('passwordInput').value;
  const fullName = $('nameInput').value.trim();

  if (!email || !password) return alert('اكتب البريد وكلمة المرور');

  const { error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) return alert(error.message);
  alert('تم إنشاء الحساب. إذا طلب تأكيد بريد، افتح بريدك واضغط رابط التأكيد. بعدها الحساب ينتظر موافقة المدير.');
  await loadSession();
}

async function signIn() {
  const email = $('emailInput').value.trim();
  const password = $('passwordInput').value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  await loadSession();
}

async function signOut() {
  await client.auth.signOut();
  currentUser = null;
  currentProfile = null;
  resetSections();
  show('authSection');
}

async function loadSession() {
  const { data } = await client.auth.getUser();
  currentUser = data.user;

  resetSections();
  if (!currentUser) {
    show('authSection');
    return;
  }

  const { data: profile, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error) {
    console.error(error);
    alert('حدث خطأ في قراءة الحساب. تأكد من إعدادات Supabase.');
    show('authSection');
    return;
  }

  currentProfile = profile;
  $('userInfo').textContent = `${profile.email || currentUser.email} | الحالة: ${profile.status} | حد يومي: ${profile.daily_limit}`;

  if (profile.status === 'pending') return show('pendingSection');
  if (profile.status === 'blocked') return show('blockedSection');

  show('appSection');
  await loadHistory();

  if (profile.is_admin) {
    show('adminSection');
    await loadUsers();
  }
}

async function checkId() {
  const idNumber = $('idInput').value.replace(/\D/g, '');
  if (!currentUser || currentProfile?.status !== 'active') return alert('الحساب غير مفعل');
  if (!idNumber) return alert('اكتب رقم الهوية');

  const valid = isValidIsraeliId(idNumber);
  const result = valid ? 'תעודת זהות תקינה' : 'תעודת זהות לא תקינה';

  $('resultBox').className = 'result ' + (valid ? 'ok' : 'bad');
  $('resultBox').textContent = valid ? '✅ رقم الهوية صحيح / תעודת זהות תקינה' : '❌ رقم الهوية غير صحيح / תעודת זהות לא תקינה';
  show('resultBox');

  const { error } = await client.from('id_checks').insert({
    user_id: currentUser.id,
    id_number: idNumber,
    result
  });

  if (error) alert('تعذر حفظ الفحص: ' + error.message);
  await loadHistory();
}

async function loadHistory() {
  const { data, error } = await client
    .from('id_checks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    $('historyList').innerHTML = '<p class="bad">خطأ في تحميل السجل</p>';
    return;
  }

  $('historyList').innerHTML = data.map(row => `
    <div class="history-item">
      <strong>${row.result}</strong><br>
      رقم: ${row.id_number}<br>
      <span class="hint">${new Date(row.created_at).toLocaleString()}</span>
    </div>
  `).join('') || '<p class="hint">لا يوجد فحوصات بعد.</p>';
}

async function loadUsers() {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    $('usersList').innerHTML = '<p class="bad">لا يمكن تحميل المستخدمين. نحتاج سياسة Admin إضافية.</p>';
    return;
  }

  $('usersList').innerHTML = data.map(user => `
    <div class="history-item">
      <strong>${user.full_name || 'بدون اسم'}</strong><br>
      ${user.email || ''}<br>
      الحالة: <strong>${user.status}</strong> | حد يومي: ${user.daily_limit} | Admin: ${user.is_admin ? 'نعم' : 'لا'}
      <div class="admin-actions">
        <button class="success" onclick="updateUserStatus('${user.id}', 'active')">تفعيل</button>
        <button class="danger" onclick="updateUserStatus('${user.id}', 'blocked')">إيقاف</button>
        <button class="secondary" onclick="updateUserStatus('${user.id}', 'pending')">انتظار</button>
      </div>
    </div>
  `).join('') || '<p class="hint">لا يوجد مستخدمين.</p>';
}

async function updateUserStatus(userId, status) {
  const { error } = await client.from('profiles').update({ status }).eq('id', userId);
  if (error) return alert(error.message);
  await loadUsers();
}

client.auth.onAuthStateChange(() => loadSession());
loadSession();

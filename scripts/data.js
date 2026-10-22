/**
 * MARBSLF - Database & Data Models
 * Centralized Lost & Found System for Koronadal City
 * Complies with System Specification Sections 1-37
 */

const STORAGE_KEY = 'marbslf_db_v1';

// Immediate purge of any legacy dummy accounts and test posts from browser storage & Firestore
try {
  const existingRaw = localStorage.getItem(STORAGE_KEY);
  if (existingRaw) {
    const parsed = JSON.parse(existingRaw);
    if (parsed) {
      if (['USR-101', 'USR-102', 'USR-103'].includes(parsed.current_user_id)) {
        parsed.current_user_id = null;
      }
      parsed.users = (parsed.users || []).filter(u => !['USR-101', 'USR-102', 'USR-103'].includes(u.user_id));
      // Delete mock posts and any junk spam test posts
      const mockIds = ['POST-001', 'POST-002', 'POST-003', 'POST-004', 'POST-005'];
      if (Array.isArray(parsed.posts)) {
        parsed.posts = parsed.posts.filter(p => {
          if (mockIds.includes(p.post_id)) return false;
          const name = (p.item_name || '').toLowerCase();
          const desc = (p.description || '').toLowerCase();
          const loc = (p.general_location || '').toLowerCase();
          return !(name.includes('mochi') || name.includes('toyota car key') || name.includes('redmi note') || name.includes('black leather bifold') || name.includes('brown aspin') || loc.includes('dwadawda') || desc.includes('dawawdawdawdaw'));
        });
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
  }
} catch (e) {}

// Seed Initial Data
const DEFAULT_SAFE_PICKUP_PLACES = [
  {
    place_id: 'SP-001',
    name: 'Koronadal City Hall - Ground Lobby / PNP Desk',
    address: 'General Santos Drive, Zone III, Koronadal City',
    latitude: 6.5028,
    longitude: 124.8468,
    operating_hours: 'Monday - Friday: 8:00 AM - 5:00 PM',
    active_status: 'ACTIVE',
    contact_person: 'Public Assistance Desk',
    type: 'Government'
  },
  {
    place_id: 'SP-002',
    name: 'Koronadal Central Police Station (PNP)',
    address: 'Alunan Avenue, Zone I, Koronadal City',
    latitude: 6.4985,
    longitude: 124.8431,
    operating_hours: '24/7 Daily',
    active_status: 'ACTIVE',
    contact_person: 'Duty Officer Desk',
    type: 'Police Station'
  },
  {
    place_id: 'SP-003',
    name: 'Koronadal Public Market Security Office',
    address: 'Gensan Drive cor. Morrow St., Koronadal City',
    latitude: 6.4952,
    longitude: 124.8475,
    operating_hours: 'Daily: 6:00 AM - 7:00 PM',
    active_status: 'ACTIVE',
    contact_person: 'Market Admin / Blue Guards',
    type: 'Public Market'
  },
  {
    place_id: 'SP-004',
    name: 'KCC Mall of Marbel - Customer Service Counter',
    address: 'General Santos Drive, Koronadal City',
    latitude: 6.5011,
    longitude: 124.8447,
    operating_hours: 'Daily: 9:00 AM - 8:00 PM',
    active_status: 'ACTIVE',
    contact_person: 'Customer Relations Desk (Level 1)',
    type: 'Mall'
  },
  {
    place_id: 'SP-005',
    name: 'Robinsons Place Koronadal - Information / Security',
    address: 'National Highway, Brgy. Morales, Koronadal City',
    latitude: 6.4889,
    longitude: 124.8512,
    operating_hours: 'Daily: 10:00 AM - 8:00 PM',
    active_status: 'ACTIVE',
    contact_person: 'Main Entrance Concierge',
    type: 'Mall'
  },
  {
    place_id: 'SP-006',
    name: 'KNCHS Main Gate - Guardhouse Station',
    address: 'Rizal Avenue, Koronadal City',
    latitude: 6.5042,
    longitude: 124.8419,
    operating_hours: 'Monday - Friday: 7:00 AM - 6:00 PM',
    active_status: 'ACTIVE',
    contact_person: 'Campus Security',
    type: 'School'
  },
  {
    place_id: 'SP-007',
    name: 'Barangay Hall Zone II - Barangay Council Office',
    address: 'Brgy. Zone II, Koronadal City',
    latitude: 6.4998,
    longitude: 124.8488,
    operating_hours: 'Monday - Friday: 8:00 AM - 5:00 PM',
    active_status: 'ACTIVE',
    contact_person: 'Barangay Secretary',
    type: 'Barangay Hall'
  }
];

// Default System Users including Central Admin
const DEFAULT_USERS = [
  {
    user_id: 'USR-ADMIN',
    first_name: 'MarbsLF',
    middle_name: '',
    last_name: 'Administrator',
    public_alias: 'System Admin #01',
    date_of_birth: '1990-01-01',
    email: 'admin@marbslf.gov.ph',
    phone: '0912-345-6789',
    username: 'admin',
    password: 'admin123',
    role: 'ADMIN',
    barangay: 'Zone II',
    province: 'South Cotabato',
    city: 'Koronadal City',
    account_status: 'ACTIVE',
    verification_status: 'VERIFIED',
    points_balance: 9999,
    rating_avg: 5.0,
    rating_count: 5,
    created_at: '2026-01-01T00:00:00Z'
  }
];


// Community Posts list - Starts clean, only real posts submitted by citizens
const DEFAULT_POSTS = [];


// Matches, Meetups, Messages, Ratings - Start empty for clean database
const DEFAULT_MATCHES = [];
const DEFAULT_MEETUPS = [];
const DEFAULT_MESSAGES = [];
const DEFAULT_RATINGS = [];

/* ==========================================================================
   PUBLIC ALIAS (Section 3 - Real Name Privacy Rule)
   The alias is the only identity shown publicly. It must NOT claim a citizen
   is "Verified" unless their ID verification is actually approved, otherwise
   an unverified account displays a contradictory "Verified Citizen" label.
   ========================================================================== */

/** Build the privacy-safe alias for a user, reflecting true verification state. */
function buildPublicAlias(user, verificationStatus) {
  const status = String(
    verificationStatus !== undefined
      ? verificationStatus
      : (user && user.verification_status) || 'UNVERIFIED'
  ).toUpperCase();

  const verified = status === 'VERIFIED';
  const seed = String((user && user.user_id) || (user && user.email) || '000000')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6)
    .padEnd(6, '0');

  return (verified ? 'Verified Citizen #' : 'Citizen #') + seed;
}

/** Always-alias accessor: returns the correct alias for the current status. */
function getPublicAlias(user) {
  if (!user) return 'Citizen';
  return buildPublicAlias(user, user.verification_status);
}

/* ==========================================================================
   DEMO POST SEEDER
   Gives every non-admin citizen a realistic set of lost/found reports so the
   community feed, dashboards and admin moderation queue are not empty.

   These are written into the database (localStorage) exactly like real posts
   - nothing is hardcoded into the UI. Posts are tagged `is_seed: true` so they
   can be identified, regenerated, or purged later.
   ========================================================================== */
const SEED_POST_BANK = [
  { post_type: 'LOST',  category: 'Electronics',      item_name: 'Blue Nokia Phone',          description: 'Left the phone on a jeepney seat during my morning commute. Screen lock still active, please contact me so I can secure the account.',      color: 'Blue',      brand: 'Nokia',     image: 'assets/phone_redmi.jpg', reward: 300 },
  { post_type: 'FOUND', category: 'Electronics',      item_name: 'Blue Nokia Phone',          description: 'Picked up a blue Nokia phone near the public market entrance. It is safe with me at my stall pending owner verification.',                                        color: 'Blue',      brand: 'Nokia',     image: 'assets/phone_redmi.jpg', reward: 0 },
  { post_type: 'LOST',  category: 'Keys',             item_name: 'Toyota Key Fob',            description: 'Lost my car keys somewhere around the city hall area. The fob has a red leather tag. Returned items are welcome, please message me directly.',                     color: 'Black',     brand: 'Toyota',    image: 'assets/car_key.jpg',     reward: 500 },
  { post_type: 'LOST',  category: 'Personal Items',   item_name: 'Black Leather Wallet',      description: 'Brown leather bifold wallet containing important cards and IDs. Last seen in Zone III. Very anxious about it, please help.',                                color: 'Black',     brand: 'Unbranded', image: 'assets/wallet_black.jpg', reward: 200 },
  { post_type: 'FOUND', category: 'Personal Items',   item_name: 'Black Leather Wallet',      description: 'Found a black leather wallet near the Koronadal City Hall lobby. Holding it safely and willing to return once ownership is proven.',                             color: 'Black',     brand: 'Unbranded', image: 'assets/wallet_black.jpg', reward: 0 },
  { post_type: 'LOST',  category: 'School Items',     item_name: 'Blue School Backpack',      description: 'Left my backpack in the school cafeteria during lunch break. It has my initials stitched on the front pocket and a lunchbox inside.',                       color: 'Blue',      brand: 'JanSport',  image: 'assets/backpack.jpg',     reward: 150 },
  { post_type: 'LOST',  category: 'IDs & Documents',  item_name: 'PhilSys ID Card',           description: 'I lost my government ID near the Koronadal Public Market. I already filed a report, please message me if you find it so I can properly claim my replacement.',        color: 'White',     brand: 'PhilSys',   image: 'assets/images.jpg',      reward: 100 },
  { post_type: 'LOST',  category: 'Clothing',         item_name: 'Grey Uniform Hoodie',       description: 'Left my school uniform hoodie at the basketball court in Zone II. Name is embroidered inside the collar.',                                                    color: 'Grey',      brand: 'Unbranded', image: 'assets/images.jpg',      reward: 80 },
  { post_type: 'LOST',  category: 'Pets',             item_name: 'White Persian Cat',         description: 'Our indoor cat slipped out near the barangay hall. She is shy, white fur with grey patches on the tail, and wears a blue collar.',                                color: 'White',     brand: '',          image: 'assets/cat_persian.jpg', breed: 'Persian Mix', reward: 400 },
  { post_type: 'FOUND', category: 'Pets',             item_name: 'White Persian Cat',         description: 'Found a white cat wandering around the park. She is safe and calm with me. Looking for the owner to claim her.',                                                    color: 'White',     brand: '',          image: 'assets/cat_persian.jpg', breed: 'Persian Mix', reward: 0 },
  { post_type: 'LOST',  category: 'Pets',             item_name: 'Brown Stray Dog',           description: 'Our brown dog ran off during a walk along the river road. Friendly but may chase vehicles. Has a red collar with no tags, please help us bring him home.',                color: 'Brown',     brand: '',          image: 'assets/aspin_dog.jpg',   breed: 'Aspin Mix',   reward: 350 },
  { post_type: 'FOUND', category: 'Pets',             item_name: 'Brown Stray Dog',           description: 'Picked up a friendly brown dog near the basketball court. He is being fed and kept safe while we look for the owner.',                                            color: 'Brown',     brand: '',          image: 'assets/aspin_dog.jpg',   breed: 'Aspin Mix',   reward: 0 }
];

const SEED_LOCATIONS = [
  'Koronadal City Hall, Zone III',
  'Koronadal Public Market, Gensan Drive',
  'Alunan Avenue, Zone I',
  'Brgy. Morales Robinsons Place',
  'KNCHS Main Gate, Rizal Avenue',
  'Zone II Basketball Court',
  'General Santos Drive, Zone IV'
];

/** Deterministic pseudo-random so a given user always gets the same seed set. */
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ensure every non-admin citizen has demo reports in the database.
 * Idempotent: users who already own seed posts are skipped.
 */
function ensureSeedPosts(db) {
  if (!db || !db.data) return 0;
  const users = db.data.users || [];
  const posts = db.data.posts || (db.data.posts = []);
  let created = 0;

  users.forEach((user) => {
    if (!user || !user.user_id) return;
    if (user.role === 'ADMIN') return; // admin never receives demo posts

    const alreadySeeded = posts.some(p => p.is_seed && p.user_id === user.user_id);
    if (alreadySeeded) return;

    const rand = seededRandom(user.user_id);
    // Pick 4 distinct templates: 2 lost + 2 found, guaranteeing category variety.
    const lost = SEED_POST_BANK.filter(p => p.post_type === 'LOST');
    const found = SEED_POST_BANK.filter(p => p.post_type === 'FOUND');

    const pickDistinct = (pool, count) => {
      const copy = pool.slice();
      const out = [];
      while (out.length < count && copy.length) {
        out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
      }
      return out;
    };

    const chosen = pickDistinct(lost, 2).concat(pickDistinct(found, 2));

    chosen.forEach((tpl, i) => {
      const daysAgo = Math.floor(rand() * 12) + i;
      const postDate = new Date(Date.now() - daysAgo * 86400000);
      const isLost = tpl.post_type === 'LOST';
      const location = SEED_LOCATIONS[Math.floor(rand() * SEED_LOCATIONS.length)];
      const postId = 'POST-S' + String(posts.length + 1).padStart(4, '0') + '-' + user.user_id.slice(-4);

      // Two extra angles per report, drawn from the shared asset pool, so each
      // post has a carousel of three photos rather than a single image.
      const extraAngles = [];
      const pool = ['assets/images.jpg', 'assets/koronadal.jpg', tpl.image];
      for (let a = 0; a < 2; a++) {
        const pick = pool[(Math.floor(rand() * pool.length) + a) % pool.length];
        if (!extraAngles.includes(pick) && pick !== tpl.image) extraAngles.push(pick);
      }

      posts.push({
        post_id: postId,
        user_id: user.user_id,
        poster_id: user.user_id,
        post_type: tpl.post_type,
        category: tpl.category,
        item_name: tpl.item_name,
        pet_type: tpl.category === 'Pets' ? 'Pet' : '',
        breed: tpl.breed || '',
        description: tpl.description,
        date: postDate.toISOString().split('T')[0],
        approximate_time: ['7:00 AM - 9:00 AM', '10:30 AM - 12:00 NN', '1:00 PM - 3:00 PM', '4:00 PM - 6:00 PM'][Math.floor(rand() * 4)],
        color: tpl.color,
        brand: tpl.brand || '',
        model: tpl.brand || '',
        serial_number_private: '',
        general_location: location,
        private_coordinates: { lat: 6.5028, lng: 124.8468, address_notes: location },
        // Most seed posts are already moderated so the public feed is populated;
        // one stays pending so the admin moderation queue has real work.
        status: i === 3 ? 'PENDING_REVIEW' : 'APPROVED',
        reward_status: isLost && tpl.reward > 0 ? 'REWARD_OFFERED' : 'NO_REWARD',
        reward_offered: isLost && tpl.reward > 0,
        reward_amount: isLost ? tpl.reward : 0,
        reward_amount_private: false,
        image: tpl.image,
        // Several angles per report so the detail carousel is demonstrable.
        images: [tpl.image, ...extraAngles],
        camera_verified: true,
        photo_hash: 'SEED-' + postId.slice(-8),
        likes_count: 2 + Math.floor(rand() * 12),
        liked_by: [],
        is_seed: true,
        created_at: postDate.toISOString()
      });
      created++;
    });
  });

  if (created > 0) db.save();
  return created;
}

const DEFAULT_MARBS_POINTS_TRANSACTIONS = [
  {
    transaction_id: 'TX-901',
    user_id: 'USR-101',
    amount: 150,
    transaction_type: 'EARNED',
    reason: 'Verified Pet Reunion (Post #POST-001)',
    related_post_id: 'POST-001',
    date: '2026-09-15T10:00:00Z',
    status: 'APPROVED' // PENDING, APPROVED, REVERSED, REDEEMED
  },
  {
    transaction_id: 'TX-902',
    user_id: 'USR-101',
    amount: 10,
    transaction_type: 'EARNED',
    reason: 'Thank The Finder Bonus',
    related_post_id: 'POST-001',
    date: '2026-09-15T10:05:00Z',
    status: 'APPROVED'
  },
  {
    transaction_id: 'TX-903',
    user_id: 'USR-102',
    amount: 100,
    transaction_type: 'EARNED',
    reason: 'Verified Successful Item Return',
    related_post_id: 'POST-002',
    date: '2026-09-18T16:00:00Z',
    status: 'APPROVED'
  },
  {
    transaction_id: 'TX-904',
    user_id: 'USR-102',
    amount: 10,
    transaction_type: 'EARNED',
    reason: 'Approved Found Item Post',
    related_post_id: 'POST-002',
    date: '2026-09-19T14:00:00Z',
    status: 'APPROVED'
  }
];

const DEFAULT_VOUCHERS = [
  {
    voucher_id: 'VOUCH-10',
    title: '₱10 Partner Store Voucher',
    points_required: 100,
    partner: 'Marbel Community Coop & Bakery',
    category: 'Voucher',
    description: 'Redeemable at participating Koronadal local bakeries and grocery stores.'
  },
  {
    voucher_id: 'VOUCH-25',
    title: '₱25 Partner Store Voucher',
    points_required: 250,
    partner: 'Koronadal City Merchant Network',
    category: 'Voucher',
    description: 'Use across participating food stalls and stores in City Proper.'
  },
  {
    voucher_id: 'VOUCH-50',
    title: '₱50 Super Saver Voucher',
    points_required: 500,
    partner: 'Marbel Commercial Partners',
    category: 'Voucher',
    description: '₱50 discount on groceries, school supplies, or transport passes.'
  },
  {
    voucher_id: 'VOUCH-PRINT',
    title: 'Free Printing (15 Pages)',
    points_required: 80,
    partner: 'Marbel Digital Printing Hub',
    category: 'Service',
    description: 'Free document and flyer printing for students and civic helpers.'
  },
  {
    voucher_id: 'VOUCH-PET',
    title: '15% Pet Food Discount Voucher',
    points_required: 150,
    partner: 'South Cotabato Pet Care & Supplies',
    category: 'Pet Care',
    description: 'Valid for cat/dog food and pet vitamins at participating vet shops.'
  }
];

const DEFAULT_REPORTS = [
  {
    report_id: 'REP-001',
    reporter_id: 'USR-101',
    reported_user_id: 'USR-103',
    reported_post_id: 'POST-003',
    reason: 'Suspicious Reward Request',
    details: 'User asked via private message if I could send money upfront via GCash before showing proof.',
    status: 'UNDER_REVIEW', // UNDER_REVIEW, RESOLVED, DISMISSED
    admin_action: 'Warning sent, flagged for supervisor check',
    created_at: '2026-09-20T08:00:00Z'
  }
];

const DEFAULT_ID_VERIFICATIONS = [];

const DEFAULT_NOTIFICATIONS = [
  {
    notification_id: 'NOTIF-01',
    user_id: 'USR-101',
    title: 'Potential Match Found!',
    body: 'A user reported finding a pet matching "Cat (Persian Mix)" near KNCHS.',
    type: 'MATCH',
    read: false,
    timestamp: '2026-09-20T17:30:00Z'
  },
  {
    notification_id: 'NOTIF-02',
    user_id: 'USR-102',
    title: 'Marbs Points Credited (+10 MP)',
    body: 'Your found item post #POST-002 has been approved by admin moderation.',
    type: 'POINTS',
    read: true,
    timestamp: '2026-09-19T14:05:00Z'
  },
  {
    notification_id: 'NOTIF-03',
    user_id: 'USR-101',
    title: 'Account Identity Verified',
    body: 'Your PhilSys National ID verification was approved. You now have full verified status.',
    type: 'VERIFICATION',
    read: true,
    timestamp: '2026-09-10T12:00:00Z'
  }
];

const DEFAULT_AUDIT_LOGS = [
  {
    log_id: 'LOG-001',
    admin_id: 'USR-ADMIN',
    action_type: 'POST_APPROVAL',
    description: 'Approved post POST-001 (Cat Persian Mix) submitted by USR-101',
    timestamp: '2026-09-20T17:15:00Z'
  },
  {
    log_id: 'LOG-002',
    admin_id: 'USR-ADMIN',
    action_type: 'ID_VERIFICATION_APPROVAL',
    description: 'Verified ID document for USR-102 (PhilSys ID)',
    timestamp: '2026-09-12T11:00:00Z'
  },
  {
    log_id: 'LOG-003',
    admin_id: 'USR-ADMIN',
    action_type: 'POINTS_AWARDED',
    description: 'System awarded +100 MP to USR-102 for verified return completion',
    timestamp: '2026-09-18T16:01:00Z'
  }
];

// Database Manager
class MarbsLFDatabase {
  constructor() {
    this._localStorageImageFallback = false;
    this._warnedStorageFallback = false;
    this.data = this.load();
    // Repair aliases that were saved with a hardcoded "Verified Citizen"
    // prefix regardless of the citizen's real verification status.
    this.syncPublicAliases();
    // Keep the feed free of generated sample reports. Real citizen posts remain.
    this.purgeDemoPosts();
  }

  createId(prefix) {
    const randomPart = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${randomPart}`;
  }

  async syncRecordToFirestore(collectionName, record) {
    if (!window.firestoreDb || !record) return false;
    const key = record.message_id || record.match_id || record.meetup_id || record.notification_id || record.transaction_id;
    if (!key) return false;
    try {
      await window.firestoreDb.collection(collectionName).doc(key).set(record, { merge: true });
      return true;
    } catch (err) {
      console.warn(`Firestore ${collectionName} sync note:`, err);
      return false;
    }
  }

  async syncFieldsToFirestore(collectionName, documentId, fields) {
    if (!window.firestoreDb || !documentId || !fields) return false;
    try {
      await window.firestoreDb.collection(collectionName).doc(documentId).set(fields, { merge: true });
      return true;
    } catch (err) {
      console.warn(`Firestore ${collectionName} field sync note:`, err);
      return false;
    }
  }

  load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.users) parsed.users = [];
        // Ensure Admin account is always present
        const hasAdmin = parsed.users.some(u => u.user_id === 'USR-ADMIN' || u.username === 'admin');
        if (!hasAdmin) {
          parsed.users.unshift(DEFAULT_USERS[0]);
        }
        // Ensure stored posts exist or initialize with default community posts
        if (!Array.isArray(parsed.posts) || parsed.posts.length === 0) {
          parsed.posts = [...DEFAULT_POSTS];
        }
        if (!Array.isArray(parsed.matches)) {
          parsed.matches = [];
        } else {
          parsed.matches = parsed.matches.filter(m => m.match_id !== 'MAT-1001');
        }
        if (!Array.isArray(parsed.ratings)) {
          parsed.ratings = [];
        } else {
          parsed.ratings = parsed.ratings.filter(r => r.rating_id !== 'RAT-801');
        }
        if (!Array.isArray(parsed.meetups)) {
          parsed.meetups = [];
        } else {
          parsed.meetups = parsed.meetups.filter(m => m.meetup_id !== 'MT-501');
        }
        if (Array.isArray(parsed.messages)) {
          parsed.messages = parsed.messages.filter(m => m.message_id !== 'MSG-001' && m.message_id !== 'MSG-002');
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Could not read localStorage:', e);
    }

    const initial = {
      users: [...DEFAULT_USERS],
      posts: DEFAULT_POSTS,
      safe_places: DEFAULT_SAFE_PICKUP_PLACES,
      matches: DEFAULT_MATCHES,
      meetups: DEFAULT_MEETUPS,
      messages: DEFAULT_MESSAGES,
      ratings: DEFAULT_RATINGS,
      points_transactions: DEFAULT_MARBS_POINTS_TRANSACTIONS,
      vouchers: DEFAULT_VOUCHERS,
      redemptions: [],
      reports: DEFAULT_REPORTS,
      id_verifications: DEFAULT_ID_VERIFICATIONS,
      notifications: DEFAULT_NOTIFICATIONS,
      audit_logs: DEFAULT_AUDIT_LOGS,
      current_user_id: null // Guest by default until real login
    };
    this.save(initial);
    return initial;
  }

  save(data = this.data) {
    try {
      if (!this._localStorageImageFallback) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      }
    } catch (e) {
      if (e?.name !== 'QuotaExceededError' && e?.code !== 22 && e?.code !== 1014) {
        console.error('Failed to save to localStorage:', e);
        return false;
      }
      this._localStorageImageFallback = true;
    }

    // Keep full-resolution images in memory/Firestore, but do not duplicate
    // large base64 payloads into the browser's small localStorage quota.
    try {
      const cacheCopy = JSON.parse(JSON.stringify(data));
      let removedImageCount = 0;
      const trimInlineImages = value => {
        if (typeof value === 'string' && /^data:image\/[\w.+-]+;base64,/i.test(value)) {
          removedImageCount++;
          return 'assets/images.jpg';
        }
        if (Array.isArray(value)) return value.map(trimInlineImages);
        if (!value || typeof value !== 'object') return value;
        Object.keys(value).forEach(key => {
          const child = value[key];
          value[key] = trimInlineImages(child);
        });
        return value;
      };
      trimInlineImages(cacheCopy);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheCopy));
      if (!this._warnedStorageFallback) {
        console.warn(`Browser cache is full; saved a compact copy without ${removedImageCount} embedded photo(s). Full live data remains unchanged in memory.`);
        this._warnedStorageFallback = true;
      }
      return true;
    } catch (fallbackError) {
      console.error('Could not save even the compact app cache to localStorage:', fallbackError);
      return false;
    }
  }

  resetToDefaults() {
    localStorage.removeItem(STORAGE_KEY);
    this.data = this.load();
    this.purgeDemoPosts();
    return this.data;
  }

  /**
   * Public helper so the app can top up demo reports whenever a new citizen
   * registers, without duplicating seeding logic in the UI layer.
   */
  seedDemoPosts() {
    return 0;
  }

  /**
   * Repair stored aliases so they match each citizen's real verification
   * status. Older accounts were saved with a hardcoded "Verified Citizen #"
   * prefix regardless of status; this rewrites them to the correct label.
   */
  syncPublicAliases() {
    let changed = 0;
    (this.data.users || []).forEach((user) => {
      if (!user || user.role === 'ADMIN') return;
      const correct = buildPublicAlias(user, user.verification_status);
      if (user.public_alias !== correct) {
        user.public_alias = correct;
        changed++;
      }
    });
    if (changed > 0) this.save();
    return changed;
  }

  /** Remove all demo posts (real citizen reports are never touched). */
  purgeDemoPosts() {
    const before = (this.data.posts || []).length;
    this.data.posts = (this.data.posts || []).filter(p => !p.is_seed);
    this.save();
    if (window.firestoreDb) {
      window.firestoreDb.collection('posts').where('is_seed', '==', true).get()
        .then(snapshot => {
          const batch = window.firestoreDb.batch();
          snapshot.forEach(doc => batch.delete(doc.ref));
          return snapshot.empty ? null : batch.commit();
        })
        .catch(error => console.warn('Could not purge marked sample posts from Firestore:', error));
    }
    return before - this.data.posts.length;
  }

  getCurrentUser() {
    if (!this.data.current_user_id) return null;
    let user = this.data.users.find(u => u.user_id === this.data.current_user_id || u.email === this.data.current_user_id) || null;
    if (!user) return null;

    // Auto-heal / sync verification status against id_verifications and admin roles
    if (user.role === 'ADMIN') {
      user.verification_status = 'VERIFIED';
    } else if (user.verification_status !== 'VERIFIED' && Array.isArray(this.data.id_verifications)) {
      const uFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
      const hasApprovedVer = this.data.id_verifications.some(v => {
        if (v.status !== 'VERIFIED') return false;
        const idMatch = v.user_id && (v.user_id === user.user_id || v.user_id === user.email);
        const nameMatch = v.full_legal_name && v.full_legal_name.trim().toLowerCase() === uFullName;
        return idMatch || nameMatch;
      });
      if (hasApprovedVer) {
        user.verification_status = 'VERIFIED';
        this.save();
      }
    }
    return user;
  }

  setCurrentUser(userId) {
    if (this.data.current_user_id !== userId) this.stopPrivateWorkflowListeners();
    this.data.current_user_id = userId;
    this.save();
  }

  stopPrivateWorkflowListeners() {
    (this._workflowUnsubscribers || []).forEach(unsubscribe => unsubscribe());
    this._workflowUnsubscribers = [];
    this._workflowListenerKeys = new Set();
    this._workflowListenerUid = null;
  }

  // Toggle Heart / Reaction on a post
  togglePostReaction(postId) {
    const post = this.data.posts.find(p => p.post_id === postId);
    if (!post) return { liked: false, count: 0 };

    if (!Array.isArray(post.liked_by)) {
      post.liked_by = [];
    }

    const currentUserId = this.data.current_user_id || 'LOCAL_GUEST';
    const index = post.liked_by.indexOf(currentUserId);
    let liked = false;

    if (index > -1) {
      // Unlike
      post.liked_by.splice(index, 1);
      post.likes_count = Math.max(0, (post.likes_count || 1) - 1);
      liked = false;
    } else {
      // Like
      post.liked_by.push(currentUserId);
      post.likes_count = (post.likes_count || 0) + 1;
      liked = true;
    }

    this.save();

    // Sync the reaction count to Firestore if available.
    //
    // update() rather than set(..., {merge:true}): a merged set CREATES the
    // document when the id is not already in the collection. Local demo posts
    // do not exist in Firestore, so every like on one wrote a stub document
    // holding only likes_count and liked_by. The next sync read those stubs
    // back into data.posts as if they were reports, which surfaced in the admin
    // moderation table as rows of literal "undefined".
    //
    // update() is a no-op when the document is absent, and the rejection is
    // swallowed below, so a like on a local-only post just stays local.
    if (window.firestoreDb) {
      try {
        window.firestoreDb.collection('posts').doc(postId).update({
          likes_count: post.likes_count,
          liked_by: post.liked_by
        }).catch(() => {});
      } catch (err) {}
    }

    return { liked: liked, count: post.likes_count };
  }

  // Marbs Point Level helper per Section 20
  static getMarbsPointLevel(points) {
    if (points >= 500) {
      return { level: 'Community Champion', badge: '', color: '#10b981', min: 500, max: null };
    }
    if (points >= 250) {
      return { level: 'Trusted Helper', badge: '', color: '#3b82f6', min: 250, max: 499 };
    }
    if (points >= 100) {
      return { level: 'Community Helper', badge: '', color: '#f59e0b', min: 100, max: 249 };
    }
    return { level: 'Community Member', badge: '', color: '#64748b', min: 0, max: 99 };
  }

  // Audit Log helper per Section 34 & 36
  logAudit(actionType, description, adminId = 'USR-ADMIN') {
    const newLog = {
      log_id: 'LOG-' + Date.now().toString().slice(-6),
      admin_id: adminId,
      action_type: actionType,
      description: description,
      timestamp: new Date().toISOString()
    };
    this.data.audit_logs.unshift(newLog);
    this.save();
    return newLog;
  }

  // Add Notification
  addNotification(userId, title, body, type = 'SYSTEM') {
    const notif = {
      notification_id: this.createId('NOTIF'),
      user_id: userId,
      title: title,
      body: body,
      type: type,
      read: false,
      timestamp: new Date().toISOString()
    };
    this.data.notifications.unshift(notif);
    this.save();
    this.syncRecordToFirestore('notifications', notif);
    return notif;
  }

  // Firebase Firestore Cloud Sync
  syncWithFirestore() {
    if (this._syncPromise) return this._syncPromise;
    this._syncPromise = this._performFirestoreSync().finally(() => { this._syncPromise = null; });
    return this._syncPromise;
  }

  async _performFirestoreSync() {
    if (!window.firestoreDb) {
      if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus('offline');
      return;
    }
    if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus('syncing');
    try {
      // Fetch independent collections together to avoid serial network latency.
      const [postsSnap, placesSnap] = await Promise.all([
        window.firestoreDb.collection('posts').get(),
        window.firestoreDb.collection('safe_pickup_places').get()
      ]);
      {
        const remotePosts = [];
        const mockIds = ['POST-001', 'POST-002', 'POST-003', 'POST-004', 'POST-005'];
        postsSnap.forEach(doc => {
          const p = doc.data();
          const docId = doc.id;
          const name = (p.item_name || '').toLowerCase();
          const desc = (p.description || '').toLowerCase();
          const loc = (p.general_location || '').toLowerCase();
          const isMock = mockIds.includes(docId) || mockIds.includes(p.post_id) || name.includes('mochi') || name.includes('toyota car key') || name.includes('redmi note') || name.includes('black leather bifold') || name.includes('brown aspin');
          const isSpam = name.includes('black wallet') || loc.includes('dwadawda') || desc.includes('dawawdawdawdaw');
          
          if (p.is_seed) {
            doc.ref.delete().catch(() => {});
          } else if (isMock || isSpam) {
            // Delete mock or spam from Firestore directly
            doc.ref.delete().catch(() => {});
          } else {
            remotePosts.push(p);
          }
        });

        // Preserve local user posts not yet visible in the remote snapshot.
        const remoteIds = new Set(remotePosts.map(p => p.post_id));
        const localOnlyPosts = (this.data.posts || []).filter(
          p => !p.is_seed && !remoteIds.has(p.post_id)
        );

        this.data.posts = remotePosts.concat(localOnlyPosts);
        this.save();
        if (typeof window.setPostsLoading === 'function') {
          window.setPostsLoading(false);
        } else if (window.renderFeed) {
          window.renderFeed();
        }
        console.log('✓ Synced posts from Firebase Firestore');
      }

      if (!placesSnap.empty) {
        const remotePlaces = [];
        placesSnap.forEach(doc => remotePlaces.push(doc.data()));
        this.data.safe_places = remotePlaces;
        this.save();
        console.log('✓ Synced safe pickup places from Firebase Firestore');
      }
      if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus('live');
    } catch (err) {
      console.warn('Firestore sync note:', err);
      if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus('offline');
    }
  }

  /** Keep the public feed and pickup places fresh without requiring a reload. */
  startFirestoreListeners() {
    if (!window.firestoreDb || this._firestoreListenersStarted) return;
    this._firestoreListenersStarted = true;

    const isHiddenDemoRecord = (p) => {
      const name = String(p.item_name || '').toLowerCase();
      const desc = String(p.description || '').toLowerCase();
      const loc = String(p.general_location || '').toLowerCase();
      return ['mochi', 'toyota car key', 'redmi note', 'black leather bifold', 'brown aspin'].some(x => name.includes(x)) ||
        name.includes('black wallet') || loc.includes('dwadawda') || desc.includes('dawawdawdawdaw');
    };

    window.firestoreDb.collection('posts').onSnapshot((snapshot) => {
      const remotePosts = [];
      snapshot.forEach((doc) => {
        const post = doc.data();
        if (post && !post.is_seed && !isHiddenDemoRecord(post)) remotePosts.push(post);
      });
      const remoteIds = new Set(remotePosts.map(p => p.post_id));
      const localOnly = (this.data.posts || []).filter(p => !p.is_seed && !remoteIds.has(p.post_id));
      const seeds = (this.data.posts || []).filter(p => p.is_seed && !remoteIds.has(p.post_id));
      this.data.posts = remotePosts.concat(localOnly, seeds);
      this.save();
      if (typeof window.renderFeed === 'function') window.renderFeed();
      if (typeof window.renderRecentActivity === 'function') window.renderRecentActivity();
      if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus('live');
      if (typeof this.startPrivateWorkflowListeners === 'function') this.startPrivateWorkflowListeners();
    }, (error) => {
      console.warn('Firestore live post listener:', error);
      if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus('offline');
    });

    window.firestoreDb.collection('safe_pickup_places').onSnapshot((snapshot) => {
      const places = [];
      snapshot.forEach((doc) => places.push(doc.data()));
      if (places.length) {
        this.data.safe_places = places;
        this.save();
      }
    }, (error) => console.warn('Firestore live pickup-place listener:', error));
  }

  startPrivateWorkflowListeners() {
    const authUser = window.firebaseAuth && window.firebaseAuth.currentUser;
    if (!window.firestoreDb || !authUser || authUser.uid !== this.data.current_user_id) return;
    if (this._workflowListenerUid !== authUser.uid) {
      (this._workflowUnsubscribers || []).forEach(unsubscribe => unsubscribe());
      this._workflowUnsubscribers = [];
      this._workflowListenerKeys = new Set();
      this._workflowListenerUid = authUser.uid;
    }

    const mergeRemote = (key, idField, records) => {
      if (key === 'id_verifications' && this.getCurrentUser()?.role === 'ADMIN') {
        this.data.id_verifications = records;
        this.save();
        if (typeof window.renderAdminVerifications === 'function') window.renderAdminVerifications();
        return;
      }
      const current = new Map((this.data[key] || []).filter(record => record && record[idField]).map(record => [record[idField], record]));
      records.forEach(record => {
        if (record && record[idField]) current.set(record[idField], record);
      });
      this.data[key] = Array.from(current.values());
      if (key === 'notifications') {
        this.data.notifications.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      }
      this.save();
      if (key === 'matches') {
        if (typeof window.renderUserDashboard === 'function') window.renderUserDashboard();
        if (typeof window.renderMeetupsView === 'function') window.renderMeetupsView();
        if (typeof window.renderMessengerThreadsList === 'function') window.renderMessengerThreadsList();
      }
      if (key === 'meetups') {
        if (typeof window.renderUserDashboard === 'function') window.renderUserDashboard();
        if (typeof window.renderMeetupsView === 'function') window.renderMeetupsView();
      }
      if (key === 'notifications' && typeof window.updateNotificationBadges === 'function') {
        window.updateNotificationBadges();
      }
      if (key === 'messages' && typeof window.updateNotificationBadges === 'function') {
        window.updateNotificationBadges();
        if (typeof window.renderMessengerThreadsList === 'function') window.renderMessengerThreadsList();
      }
    };
    const listen = (collection, query, stateKey, idField, listenerKey) => {
      if (this._workflowListenerKeys.has(listenerKey)) return;
      this._workflowListenerKeys.add(listenerKey);
      this._workflowUnsubscribers.push(query.onSnapshot(snapshot => {
        const records = [];
        snapshot.forEach(doc => records.push(doc.data()));
        mergeRemote(stateKey, idField, records);
      }, error => {
        console.warn(`Firestore ${collection} live listener:`, error);
        if (collection === 'id_verifications' && this.getCurrentUser()?.role === 'ADMIN') {
          const table = document.getElementById('adminVerificationsTbody');
          if (table) table.innerHTML = '<tr><td colspan="7">Could not load ID submissions. Check Firebase admin access and Firestore permissions.</td></tr>';
        }
      }));
    };

    const uid = authUser.uid;
    listen('matches', window.firestoreDb.collection('matches').where('claimant_id', '==', uid), 'matches', 'match_id', `claimant:${uid}`);
    const ownedPostIds = (this.data.posts || []).filter(post => post.user_id === uid).map(post => post.post_id);
    ownedPostIds.forEach(postId => {
      listen('matches', window.firestoreDb.collection('matches').where('post_id', '==', postId), 'matches', 'match_id', `post:${postId}`);
    });
    listen('meetups', window.firestoreDb.collection('meetups').where('owner_id', '==', uid), 'meetups', 'meetup_id', `meetup-owner:${uid}`);
    listen('meetups', window.firestoreDb.collection('meetups').where('finder_id', '==', uid), 'meetups', 'meetup_id', `meetup-finder:${uid}`);
    listen('notifications', window.firestoreDb.collection('notifications').where('user_id', '==', uid), 'notifications', 'notification_id', `notifications:${uid}`);
    listen('messages', window.firestoreDb.collection('messages').where('receiver_id', '==', uid), 'messages', 'message_id', `inbox:${uid}`);
    if (this.getCurrentUser()?.role === 'ADMIN') {
      listen('id_verifications', window.firestoreDb.collection('id_verifications'), 'id_verifications', 'verification_id', `id-verifications:admin:${uid}`);
    } else {
      listen('id_verifications', window.firestoreDb.collection('id_verifications').where('user_id', '==', uid), 'id_verifications', 'verification_id', `id-verifications:user:${uid}`);
    }
  }

  async syncPostToFirestore(post) {
    if (!window.firestoreDb) return;
    try {
      await window.firestoreDb.collection('posts').doc(post.post_id).set(post, { merge: true });
      console.log(`✓ Post ${post.post_id} saved to Firebase Firestore`);
    } catch (e) {
      console.warn('Firestore post push warning:', e);
    }
  }

  // Backward compatible alias
  async syncWithSupabase() { return this.syncWithFirestore(); }
  async syncPostToSupabase(post) { return this.syncPostToFirestore(post); }
}

// Global DB instance
window.marbsDB = new MarbsLFDatabase();
window.getPublicAlias = getPublicAlias;
window.buildPublicAlias = buildPublicAlias;

// Attempt background sync if Supabase is active
if (window.supabaseClient) {
  window.marbsDB.syncWithSupabase();
}


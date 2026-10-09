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
      if (['USR-101', 'USR-102', 'USR-103', 'USR-ADMIN'].includes(parsed.current_user_id)) {
        parsed.current_user_id = null;
      }
      parsed.users = (parsed.users || []).filter(u => !['USR-101', 'USR-102', 'USR-103', 'USR-ADMIN'].includes(u.user_id));
      // Delete any test posts like 'Black Wallet' or empty test posts
      if (Array.isArray(parsed.posts)) {
        parsed.posts = parsed.posts.filter(p => {
          const name = (p.item_name || '').toLowerCase();
          const desc = (p.description || '').toLowerCase();
          const loc = (p.general_location || '').toLowerCase();
          return !(name.includes('black wallet') || loc.includes('dwadawda') || desc.includes('dawawdawdawdaw'));
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
    created_at: '2026-01-01T00:00:00Z'
  }
];


// Real Posts list - Clean and ready for real citizen reports
const DEFAULT_POSTS = [];

const DEFAULT_MATCHES = [
  {
    match_id: 'MAT-1001',
    lost_post_id: 'POST-003',
    found_post_id: 'POST-002', // Example linked match
    claimant_id: 'USR-103',
    status: 'POTENTIAL_MATCH', // MATCH_REQUESTED, VERIFICATION_IN_PROGRESS, POTENTIAL_MATCH, MATCH_CONFIRMED, MATCH_REJECTED, RETURN_SCHEDULED, RETURN_COMPLETED, RESOLVED
    match_score: 85,
    qna_responses: {
      location_lost: 'Gaisano Grand Parking Area',
      approx_time: 'Sept 18, around 11am',
      color: 'Black fob and silver key',
      identifying_marks: 'Crack on unlock button and red gym pass ribbon',
      accessories: 'Silver clasp ring with tiny gym tag',
      private_proof: 'Remote has chip ID stamped on inside casing'
    },
    created_at: '2026-09-19T10:00:00Z'
  }
];

const DEFAULT_MEETUPS = [
  {
    meetup_id: 'MT-501',
    match_id: 'MAT-1001',
    post_id: 'POST-002',
    owner_id: 'USR-103',
    finder_id: 'USR-102',
    place_id: 'SP-004',
    place_name: 'KCC Mall of Marbel - Customer Service Counter',
    date: '2026-09-23',
    time: '2:30 PM',
    status: 'CONFIRMED', // PENDING, CONFIRMED, RESCHEDULE_REQUESTED, CANCELLED, COMPLETED, DISPUTED
    owner_confirmed_return: false,
    finder_confirmed_return: false,
    safety_acknowledged: true,
    created_at: '2026-09-20T11:00:00Z'
  }
];

const DEFAULT_MESSAGES = [
  {
    message_id: 'MSG-001',
    sender_id: 'USR-103',
    receiver_id: 'USR-102',
    post_id: 'POST-002',
    message: 'Hello! I saw your found post. I submitted the ownership verification answers. Is it still safe with you?',
    timestamp: '2026-09-19T14:15:00Z',
    status: 'READ'
  },
  {
    message_id: 'MSG-002',
    sender_id: 'USR-102',
    receiver_id: 'USR-103',
    post_id: 'POST-002',
    message: 'Hi! Yes, I reviewed your identifying marks and it matches the item exactly. Let us schedule a return at KCC Mall Customer Service.',
    timestamp: '2026-09-19T14:22:00Z',
    status: 'READ'
  }
];

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

const DEFAULT_ID_VERIFICATIONS = [
  {
    verification_id: 'VER-001',
    user_id: 'USR-103',
    full_legal_name: 'Arlene Gomez Mendoza',
    id_type: 'National ID',
    id_image: 'assets/id_sample.jpg',
    camera_verified: true,
    status: 'PENDING', // UNVERIFIED, PENDING, VERIFIED, REJECTED, SUSPENDED
    submitted_at: '2026-09-20T10:00:00Z',
    reviewed_by: '',
    reviewed_at: ''
  }
];

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
    this.data = this.load();
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
        // Clear all posts and matches completely
        parsed.posts = [];
        parsed.matches = [];
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  resetToDefaults() {
    localStorage.removeItem(STORAGE_KEY);
    this.data = this.load();
    return this.data;
  }

  getCurrentUser() {
    if (!this.data.current_user_id) return null;
    return this.data.users.find(u => u.user_id === this.data.current_user_id) || null;
  }

  setCurrentUser(userId) {
    this.data.current_user_id = userId;
    this.save();
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

    // Sync reaction count to Firestore if available
    if (window.firestoreDb) {
      try {
        window.firestoreDb.collection('posts').doc(postId).update({
          likes_count: post.likes_count,
          liked_by: post.liked_by
        }).catch(err => console.warn('Could not update Firestore likes:', err));
      } catch (err) {}
    }

    return { liked: liked, count: post.likes_count };
  }

  // Marbs Point Level helper per Section 20
  static getMarbsPointLevel(points) {
    if (points >= 500) {
      return { level: 'Community Champion', badge: '🏆', color: '#10b981', min: 500, max: null };
    }
    if (points >= 250) {
      return { level: 'Trusted Helper', badge: '⭐', color: '#3b82f6', min: 250, max: 499 };
    }
    if (points >= 100) {
      return { level: 'Community Helper', badge: '🤝', color: '#f59e0b', min: 100, max: 249 };
    }
    return { level: 'Community Member', badge: '🌱', color: '#64748b', min: 0, max: 99 };
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
      notification_id: 'NOTIF-' + Date.now().toString().slice(-6),
      user_id: userId,
      title: title,
      body: body,
      type: type,
      read: false,
      timestamp: new Date().toISOString()
    };
    this.data.notifications.unshift(notif);
    this.save();
    return notif;
  }

  // Firebase Firestore Cloud Sync
  async syncWithFirestore() {
    if (!window.firestoreDb) return;
    try {
      // 1. Fetch live posts
      const postsSnap = await window.firestoreDb.collection('posts').get();
      if (!postsSnap.empty) {
        const remotePosts = [];
        postsSnap.forEach(doc => {
          const p = doc.data();
          const name = (p.item_name || '').toLowerCase();
          const desc = (p.description || '').toLowerCase();
          const loc = (p.general_location || '').toLowerCase();
          if (name.includes('black wallet') || loc.includes('dwadawda') || desc.includes('dawawdawdawdaw')) {
            // Delete from Firestore directly
            doc.ref.delete().catch(() => {});
          } else {
            remotePosts.push(p);
          }
        });
        this.data.posts = remotePosts;
        this.save();
        if (window.renderFeed) window.renderFeed();
        console.log('✓ Synced posts from Firebase Firestore');
      }

      // 2. Fetch live safe pickup places
      const placesSnap = await window.firestoreDb.collection('safe_pickup_places').get();
      if (!placesSnap.empty) {
        const remotePlaces = [];
        placesSnap.forEach(doc => remotePlaces.push(doc.data()));
        this.data.safe_places = remotePlaces;
        this.save();
        console.log('✓ Synced safe pickup places from Firebase Firestore');
      }
    } catch (err) {
      console.warn('Firestore sync note:', err);
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

// Attempt background sync if Supabase is active
if (window.supabaseClient) {
  window.marbsDB.syncWithSupabase();
}


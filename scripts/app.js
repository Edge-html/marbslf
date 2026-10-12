/**
 * MARBSLF - Main Application Controller
 * Koronadal Lost & Found System
 * Complies with System Specification Sections 1-37
 */

(function () {
  'use strict';

  // State
  let isPostsLoading = true;
  let currentFilter = 'ALL';
  let currentCategory = 'ALL';
  let currentArea = 'ALL';
  let currentSearchQuery = '';
  let activePostForModal = null;
  let activeChatPost = null;
  let activeCameraContext = null; // 'lost', 'found', 'id', or 'claim_proof'
  let capturedPhotoPayload = null;
  let claimPhotoPayload = null;
  let lostUploadedPhotos = []; // Array of photo objects { image_data, image_hash, timestamp }
  let currentView = 'landing'; // Currently painted view ('landing' | 'home' | 'admin' | ...)
  let isRouterReady = false; // Guards against redirects before initApp finishes

  // DOM Elements cache helper
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // Render Skeleton Loading Placeholder for Recent Posts
  function renderSkeletonFeed() {
    const grid = $('#postsGrid');
    if (!grid) return;

    grid.innerHTML = Array.from({ length: 4 }).map(() => `
      <div class="skeleton-card">
        <div class="skeleton-img skeleton-shimmer"></div>
        <div class="skeleton-body">
          <div class="skeleton-line title skeleton-shimmer"></div>
          <div class="skeleton-line meta skeleton-shimmer"></div>
          <div class="skeleton-line desc skeleton-shimmer"></div>
          <div class="skeleton-footer">
            <div class="skeleton-line skeleton-shimmer" style="width: 40px; height: 20px; border-radius: 4px;"></div>
            <div class="skeleton-btn skeleton-shimmer"></div>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Initialize Application
  function initApp() {
    setupEvaluatorBar();
    setupNavigation();
    setupRouter();
    setupCategoryAndAreaFilters();
    setupSearch();
    setupPostModals();
    setupCameraTriggers();
    setupAuthModals();
    setupVerificationModal();
    setupOwnershipClaim();
    setupMeetupAndReturnSystem();
    setupMessaging();
    setupPointsWallet();
    setupScamReporting();
    setupAdminPortal();
    setupInteractiveMap();
    setupLandingPageForms();

    // Show initial skeleton loading state
    renderFeed();
    renderRecentActivity();
    renderUserPill();
    updateNotificationBadges();

    // Reveal posts once data is ready (smooth transition with slight realistic loading buffer)
    const revealPostsWhenReady = () => {
      isPostsLoading = false;
      renderFeed();
      renderRecentActivity();
    };

    // If Firestore sync finishes or after a brief initial loading buffer
    setTimeout(revealPostsWhenReady, 450);

    // Route resolution. Order matters: honor an explicit URL first, then the
    // signed-in citizen's saved view, and finally fall back to the public
    // landing page for guests. Auth-gated views are enforced inside
    // navigateToView(), so a guest deep-link to /admin safely lands on "/".
    const routeFromUrl = viewFromHash(window.location.hash);
    const initialView = routeFromUrl || resolveDefaultView();
    navigateToView(initialView, { replaceHistory: true });
    isRouterReady = true;

    // Sync posts from Firestore cloud so posts are always up to date for guests and logged-in users
    if (window.marbsDB && typeof window.marbsDB.syncWithFirestore === 'function') {
      window.marbsDB.syncWithFirestore().then(() => {
        revealPostsWhenReady();
      }).catch(() => {
        revealPostsWhenReady();
      });
    }

    // Check Firebase / session after all modules are initialized
    if (typeof window.checkCurrentSession === 'function') {
      Promise.resolve(window.checkCurrentSession())
        .catch(() => null)
        .then(() => {
          // Top up demo reports for any citizen registered in a previous session.
          if (window.marbsDB && typeof window.marbsDB.seedDemoPosts === 'function') {
            if (window.marbsDB.seedDemoPosts() > 0) {
              renderFeed();
              renderRecentActivity();
            }
          }
        });
    }
  }

  // 1. Evaluator Quick-Switcher (Allows immediate testing of User vs Admin roles)
  function setupEvaluatorBar() {
    const userSelect = $('#evaluatorUserSelect');
    if (userSelect) {
      userSelect.value = marbsDB.data.current_user_id;
      userSelect.addEventListener('change', (e) => {
        marbsDB.setCurrentUser(e.target.value);
        const currentUser = marbsDB.getCurrentUser();
        const isAdmin = currentUser && currentUser.role === 'ADMIN';
        renderUserPill();
        renderFeed();
        renderUserDashboard();
        if (isAdmin) {
          navigateToView('admin');
        } else {
          navigateToView('home');
        }
        showToast(`Switched active session to: ${currentUser.first_name} (${currentUser.role})`);
      });
    }

    const resetBtn = $('#evaluatorResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset demo database to fresh Koronadal City seed data?')) {
          marbsDB.resetToDefaults();
          location.reload();
        }
      });
    }
  }

  // 2. Navigation & Views Switching
  function setupNavigation() {
    // Mobile menu drawer toggle (Sidebar Nav)
    const mobileToggle = $('#mobileMenuToggle');
    const sidebarNav = $('#sidebarNav');
    const navMenu = $('#navMenu');
    
    if (mobileToggle) {
      mobileToggle.addEventListener('click', () => {
        mobileToggle.classList.toggle('active');
        if (sidebarNav) sidebarNav.classList.toggle('active');
        if (navMenu) navMenu.classList.toggle('active');
      });
    }

    // Helper to sync active state on landing page nav buttons
    function setLandingNavActive(pageNum, tab) {
      $$('[data-lp-target]').forEach(b => {
        const matchesPage = parseInt(b.dataset.lpTarget) === pageNum;
        if (pageNum === 3) {
          const matchesTab = !tab || !b.dataset.lpTab || b.dataset.lpTab === tab;
          b.classList.toggle('active', matchesPage && matchesTab);
        } else {
          b.classList.toggle('active', matchesPage);
        }
      });
    }
    window.setLandingNavActive = setLandingNavActive;

    $$('.nav-link-btn, .dropdown-item').forEach(btn => {
      btn.addEventListener('click', () => {
        // Landing page internal section navigation
        if (btn.dataset.lpTarget) {
          const pageNum = parseInt(btn.dataset.lpTarget);
          const tab = btn.dataset.lpTab || null;
          scrollToLandingPage(pageNum, tab);
          setLandingNavActive(pageNum, tab);

          if (mobileToggle) mobileToggle.classList.remove('active');
          if (sidebarNav) sidebarNav.classList.remove('active');
          if (navMenu) navMenu.classList.remove('active');
          return;
        }

        $$('#appNavLinks .nav-link-btn, #mobileAppNavLinks .nav-link-btn').forEach(b => b.classList.remove('active'));
        if (btn.classList.contains('nav-link-btn')) {
          btn.classList.add('active');
        } else {
          const browseBtn = $('#browseDropdownBtn');
          if (browseBtn) browseBtn.classList.add('active');
        }

        // Automatically close mobile menu drawer upon link click
        if (mobileToggle) mobileToggle.classList.remove('active');
        if (sidebarNav) sidebarNav.classList.remove('active');
        if (navMenu) navMenu.classList.remove('active');

        const view = btn.dataset.view;
        const currentUser = marbsDB.getCurrentUser();
        const isAdmin = currentUser && currentUser.role === 'ADMIN';

        // For admin, their "Home" is the Admin Portal
        if (isAdmin && view === 'home') {
          navigateToView('admin');
          return;
        }

        if (view) navigateToView(view);
      });
    });

    const brandLogo = $('#brandLogo');
    if (brandLogo) {
      brandLogo.addEventListener('click', () => {
        const currentUser = marbsDB.getCurrentUser();
        if (!currentUser) {
          navigateToView('landing');
          setLandingNavActive(1);
        } else {
          navigateToView('home');
        }
        if (mobileToggle) mobileToggle.classList.remove('active');
        if (sidebarNav) sidebarNav.classList.remove('active');
        if (navMenu) navMenu.classList.remove('active');
      });
    }

    const navUserBtn = $('#navUserBtn');
    if (navUserBtn) {
      navUserBtn.addEventListener('click', () => {
        const user = marbsDB.getCurrentUser();
        if (user.role === 'ADMIN') {
          navigateToView('admin');
        } else {
          navigateToView('dashboard');
        }
      });
    }

    const navNotifBtn = $('#navNotifBtn');
    if (navNotifBtn) {
      navNotifBtn.addEventListener('click', openNotificationsModal);
    }
  }

  /**
   * Apply the shared chrome (navbar links + auth controls) for a given surface.
   * 'landing' = public marketing site, 'app' = authenticated main application.
   * This is the ONLY function allowed to toggle nav surfaces, so the navbar can
   * never disagree with the page body.
   */
  function applySurfaceChrome(surface, activeView) {
    const isLanding = surface === 'landing';
    const landingNav = $('#landingNavLinks');
    const appNav = $('#appNavLinks');
    const mobileLandingNav = $('#mobileLandingNavLinks');
    const mobileAppNav = $('#mobileAppNavLinks');

    if (landingNav) landingNav.style.display = isLanding ? 'flex' : 'none';
    if (appNav) appNav.style.display = isLanding ? 'none' : 'flex';
    if (mobileLandingNav) mobileLandingNav.style.display = isLanding ? '' : 'none';
    if (mobileAppNav) mobileAppNav.style.display = isLanding ? 'none' : '';

    // Search / notifications are application features, never shown on the landing page.
    const navSearchBtn = $('#navSearchBtn');
    const navNotifBtn = $('#navNotifBtn');
    if (navSearchBtn) navSearchBtn.style.display = isLanding ? 'none' : '';
    if (navNotifBtn) navNotifBtn.style.display = isLanding ? 'none' : '';

    document.body.setAttribute('data-surface', surface);

    // Sync active state for app links
    $$('#appNavLinks .nav-link-btn, #mobileAppNavLinks .nav-link-btn').forEach(b => {
      b.classList.toggle('active', !isLanding && b.dataset.view === activeView);
    });
    $$('#landingNavLinks .nav-link-btn, #mobileLandingNavLinks .nav-link-btn').forEach(b => {
      b.classList.remove('active');
    });
  }

  // Auth-gated views: guests are bounced back to the landing page.
  const AUTH_GATED_VIEWS = ['dashboard', 'verifications', 'meetups', 'admin'];

  function navigateToView(viewName, options = {}) {
    const currentUser = marbsDB.getCurrentUser();
    const isAdmin = !!(currentUser && currentUser.role === 'ADMIN');

    // --- Resolve the requested view into an actual surface + view -----------
    let target = viewName;
    if (target === 'home' && !currentUser) {
      target = 'landing';
    }
    if (target === 'landing' && currentUser && !options.allowLanding) {
      // A signed-in citizen never stays on the public landing page.
      target = isAdmin ? 'admin' : 'home';
    }
    if (target === 'home' && isAdmin && !options.allowLanding) {
      target = 'admin';
    }
    if (AUTH_GATED_VIEWS.includes(target) && !currentUser) {
      target = 'landing';
    }

    const surface = target === 'landing' ? 'landing' : 'app';
    applySurfaceChrome(surface, target);

    // --- Hide all primary views --------------------------------------------
    const landingPageView = $('#landingPageView');
    if (landingPageView) landingPageView.style.display = 'none';
    $('#homeView').style.display = 'none';
    $('#dashboardView').style.display = 'none';
    $('#adminView').style.display = 'none';
    $('#howItWorksView').style.display = 'none';
    const meetupsView = $('#meetupsView');
    if (meetupsView) meetupsView.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Persist + reflect the route in the URL so pages are shareable and
    // the browser Back/Forward buttons behave correctly.
    if (!options.skipHistory) {
      try {
        if (target === 'landing') {
          localStorage.removeItem('marbslf_active_view');
        } else {
          localStorage.setItem('marbslf_active_view', target);
        }
      } catch (e) {}
      updateUrlForView(target, options);
    }

    currentView = target;

    if (target === 'home') {
      currentFilter = 'ALL';
      currentCategory = 'ALL';
      $('#homeView').style.display = 'block';
      renderFeed();
    } else if (target === 'landing') {
      if (landingPageView) landingPageView.style.display = 'block';
      if (typeof setLandingNavActive === 'function') setLandingNavActive(1);
    } else if (target === 'lost-items') {
      currentFilter = 'LOST_ITEMS';
      currentCategory = 'ALL';
      $('#homeView').style.display = 'block';
      renderFeed();
    } else if (target === 'found-items') {
      currentFilter = 'FOUND_ITEMS';
      currentCategory = 'ALL';
      $('#homeView').style.display = 'block';
      renderFeed();
    } else if (target === 'lost-pets') {
      currentFilter = 'LOST_PETS';
      currentCategory = 'Pets';
      $('#homeView').style.display = 'block';
      renderFeed();
    } else if (target === 'found-pets') {
      currentFilter = 'FOUND_PETS';
      currentCategory = 'Pets';
      $('#homeView').style.display = 'block';
      renderFeed();
    } else if (target === 'how-it-works') {
      $('#howItWorksView').style.display = 'block';
    } else if (target === 'dashboard') {
      const user = marbsDB.getCurrentUser();
      if (!user) {
        openLoginModal();
        showToast('Please log in to view your dashboard.');
        $('#homeView').style.display = 'block';
        return;
      }
      $('#dashboardView').style.display = 'block';
      renderUserDashboard();
    } else if (target === 'verifications') {
      const user = marbsDB.getCurrentUser();
      if (!user) {
        openLoginModal();
        showToast('Please log in to view verification answers.');
        $('#homeView').style.display = 'block';
        return;
      }
      $('#homeView').style.display = 'block';
      renderFeed();
      window.openVerificationsModal();
    } else if (target === 'meetups') {
      const user = marbsDB.getCurrentUser();
      if (!user) {
        openLoginModal();
        showToast('Please log in to view your Safe Meetups.');
        $('#homeView').style.display = 'block';
        return;
      }
      const meetupsView = $('#meetupsView');
      if (meetupsView) meetupsView.style.display = 'block';
      renderMeetupsView();
    } else if (target === 'admin') {
      const user = marbsDB.getCurrentUser();
      if (!user || user.role !== 'ADMIN') {
        openLoginModal();
        showToast('City Administrator privileges required.');
        $('#homeView').style.display = 'block';
        return;
      }
      $('#adminView').style.display = 'block';
      renderAdminPortal();
    }
  }
  window.navigateToView = navigateToView;

  /**
   * Landing page = "#/"  •  Main app = "#/home", "#/lost-items", "#/admin", ...
   * Hash routing is used deliberately: this app is served as static files by
   * `python -m http.server`, which has no history fallback, so path-based
   * routing (pushState to /home) would 404 on reload or direct link.
   */
  const VALID_VIEWS = ['landing', 'home', 'lost-items', 'found-items', 'lost-pets',
    'found-pets', 'how-it-works', 'dashboard', 'verifications', 'meetups', 'admin'];

  function hashForView(viewName) {
    return viewName === 'landing' ? '#/' : '#/' + viewName;
  }

  function updateUrlForView(viewName, options = {}) {
    const hash = hashForView(viewName);
    if (window.location.hash === hash) return;
    if (options.replaceHistory) {
      try {
        window.history.replaceState(null, '', hash);
      } catch (e) {
        window.location.hash = hash;
      }
    } else {
      window.location.hash = hash; // triggers hashchange -> routes the view
      return; // hashchange handler performs the actual navigation
    }
  }

  function viewFromHash(hash) {
    const seg = String(hash || '').replace(/^#\/?/, '').trim();
    if (!seg) return null; // "#/" or "" -> decide from auth state
    return VALID_VIEWS.includes(seg) ? seg : null;
  }

  // Deep links (e.g. #/lost-items) + browser Back/Forward support.
  function setupRouter() {
    window.addEventListener('hashchange', () => {
      if (!isRouterReady) return;
      const view = viewFromHash(window.location.hash);
      navigateToView(view || resolveDefaultView(), { skipHistory: true });
      // Keep the address bar truthful when a guard redirected the view
      // (e.g. guest opening #/dashboard lands on the landing page).
      if (window.location.hash !== hashForView(currentView)) {
        updateUrlForView(currentView, { replaceHistory: true });
      }
    });
  }

  // Where a visitor lands when no explicit route is present in the URL.
  function resolveDefaultView() {
    const currentUser = marbsDB.getCurrentUser();
    if (!currentUser) return 'landing';
    if (currentUser.role === 'ADMIN') return 'admin';
    try {
      const savedView = localStorage.getItem('marbslf_active_view');
      if (savedView && savedView !== 'landing' && VALID_VIEWS.includes(savedView)) {
        return savedView;
      }
    } catch (e) {}
    return 'home';
  }

  // 3. Category & Area Filters (Mockup feature)
  function setupCategoryAndAreaFilters() {
    $$('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.category;
        renderFeed();
      });
    });



  }

  // 4. Real-time Search
  function setupSearch() {
    const heroInput = $('#heroSearchInput');
    const heroBtn = $('#heroSearchBtn');

    const executeSearch = () => {
      currentSearchQuery = heroInput.value.trim().toLowerCase();
      renderFeed();
      if ($('#homeView').style.display === 'none') {
        navigateToView('home');
      }
    };

    if (heroBtn && heroInput) {
      heroInput.addEventListener('input', executeSearch);
      heroBtn.addEventListener('click', executeSearch);
      heroInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') executeSearch();
      });
    }

    const navSearchBtn = $('#navSearchBtn');
    if (navSearchBtn) {
      navSearchBtn.addEventListener('click', () => {
        navigateToView('home');
        $('#heroSearchInput').focus();
      });
    }
  }

  // 5. Render Feed of Posts (Section 2, 11, 18, 33)
  function renderFeed() {
    const grid = $('#postsGrid');
    if (!grid) return;

    // Loading feature: show skeleton placeholders while data is preparing
    if (isPostsLoading) {
      renderSkeletonFeed();
      return;
    }

    // Show only APPROVED posts in the public community feed per Section 10 Post Moderation
    let posts = marbsDB.data.posts.filter(p => p.status === 'APPROVED');

    // Filter by type
    if (currentFilter === 'LOST_ITEMS') {
      posts = posts.filter(p => p.post_type === 'LOST' && p.category !== 'Pets');
    } else if (currentFilter === 'FOUND_ITEMS') {
      posts = posts.filter(p => p.post_type === 'FOUND' && p.category !== 'Pets');
    } else if (currentFilter === 'LOST_PETS') {
      posts = posts.filter(p => p.post_type === 'LOST' && p.category === 'Pets');
    } else if (currentFilter === 'FOUND_PETS') {
      posts = posts.filter(p => p.post_type === 'FOUND' && p.category === 'Pets');
    }

    // Filter by category chip
    if (currentCategory !== 'ALL') {
      posts = posts.filter(p => p.category.toLowerCase() === currentCategory.toLowerCase());
    }

    // Filter by area
    if (currentArea !== 'ALL') {
      posts = posts.filter(p => p.general_location.toLowerCase().includes(currentArea.toLowerCase()));
    }

    // Filter by search query
    if (currentSearchQuery) {
      posts = posts.filter(p =>
        p.item_name.toLowerCase().includes(currentSearchQuery) ||
        p.description.toLowerCase().includes(currentSearchQuery) ||
        p.general_location.toLowerCase().includes(currentSearchQuery) ||
        p.color.toLowerCase().includes(currentSearchQuery) ||
        (p.breed && p.breed.toLowerCase().includes(currentSearchQuery))
      );
    }

    if (posts.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: #fff; border-radius: var(--radius-lg); border: 1px dashed var(--border);">
          <div style="width: 48px; height: 48px; border-radius: var(--radius-full); background: var(--surface-alt); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto; color: var(--text-muted);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">No matching reports found</h3>
          <p style="font-size: 13px; color: var(--text-muted); max-width: 400px; margin: 0 auto 16px auto;">
            Try clearing search filters or report a new lost or found item to let the Koronadal community know.
          </p>
          <button class="btn btn-primary" onclick="window.marbsApp.openReportModal('LOST')">Report Lost Item</button>
        </div>
      `;
      return;
    }

    const currentUserId = marbsDB.data.current_user_id || 'LOCAL_GUEST';

    grid.innerHTML = posts.map(post => {
      const isLost = post.post_type === 'LOST';
      const statusText = isLost ? 'Lost' : 'Found';
      const statusDotClass = isLost ? 'lost' : 'found';
      const isLiked = Array.isArray(post.liked_by) && post.liked_by.includes(currentUserId);
      const likesCount = typeof post.likes_count === 'number' ? post.likes_count : 0;
      
      const currentUser = marbsDB.getCurrentUser();
      const isOwnPost = Boolean(currentUser && (
        (post.user_id && currentUser.user_id === post.user_id) ||
        (post.poster_id && currentUser.user_id === post.poster_id) ||
        (currentUser.user_id === 'USR-ADMIN' && (post.user_id === 'USR-ADMIN' || post.user_id === 'USR-GUEST'))
      ));

      const canManage = Boolean(currentUser && (currentUser.role === 'ADMIN' || isOwnPost));

      return `
        <article class="post-card" onclick="window.marbsApp.openPostDetailModal('${post.post_id}')">
          <div class="post-image-container">
            <img src="${post.image}" alt="${escapeHtml(post.item_name)}" class="post-image" onerror="this.src='assets/images.jpg'">
          </div>
          <div class="post-body">
            <div class="card-status-row">
              <span class="status-dot ${statusDotClass}"></span>
              <span class="status-label ${statusDotClass}">${statusText}</span>
              <span class="meta-sep">•</span>
              <span class="card-location">${escapeHtml(post.general_location)}</span>
              <span class="meta-sep">•</span>
              <span class="card-date">${post.date}</span>
            </div>
            <h3 class="post-title" title="${escapeHtml(post.item_name)}">${escapeHtml(post.item_name)}</h3>
            <p class="post-desc">${escapeHtml(post.description)}</p>
            <div class="post-footer">
              <button type="button" class="post-like-btn ${isLiked ? 'liked' : ''}" id="like-btn-${post.post_id}" onclick="event.stopPropagation(); window.marbsApp.toggleLike('${post.post_id}')" title="Heart this post">
                <span class="heart-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                </span>
                <span class="like-count" id="like-count-${post.post_id}">${likesCount}</span>
              </button>

              <div style="display: flex; align-items: center; gap: 8px;">
                ${isOwnPost ? `<span class="quiet-own-post">Your post</span>` : ''}
                ${(() => {
                  if (isOwnPost) {
                    const postAnswersCount = (marbsDB.data.matches || []).filter(m =>
                      (m.lost_post_id === post.post_id || m.found_post_id === post.post_id) &&
                      (!currentUser || m.claimant_id !== currentUser.user_id)
                    ).length;

                    return `
                      <button type="button" class="post-answers-btn" onclick="event.stopPropagation(); window.openPostVerificationAnswers('${post.post_id}')" title="View verification answers">
                        <span>Verification Answers ${postAnswersCount > 0 ? `(${postAnswersCount})` : ''}</span>
                      </button>
                    `;
                  }

                  return `
                    <button type="button" class="post-claim-btn" onclick="event.stopPropagation(); window.marbsApp.handlePostAction('${post.post_id}')">
                      ${isLost ? 'Found this?' : 'I Think This Is Mine'}
                    </button>
                  `;
                })()}

                ${canManage ? `
                  <button type="button" class="icon-btn" style="width: 26px; height: 26px; border: none; background: transparent; padding: 0;" onclick="event.stopPropagation(); window.marbsApp.deletePost('${post.post_id}')" title="Post options">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // 6. Recent Activity Feed (Right Column of Mockup)
  function renderRecentActivity() {
    const list = $('#recentActivityList');
    if (!list) return;

    const realPosts = marbsDB.data.posts.filter(p => p.status === 'APPROVED').slice(0, 5);

    if (realPosts.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 24px 12px; color: var(--text-muted); font-size: 13px;">
          No recent activity yet.<br>New lost and found reports will appear here in real time.
        </div>
      `;
      return;
    }

    list.innerHTML = realPosts.map(p => {
      const isLost = p.post_type === 'LOST';
      const badge = isLost ? 'Lost' : 'Found';
      const type = isLost ? 'lost' : 'found';
      const verb = isLost ? 'was reported lost' : 'was found';
      const text = `${p.item_name} ${verb} in ${p.general_location || 'Koronadal City'}.`;
      
      // Calculate human-friendly time elapsed
      let timeStr = 'Just now';
      if (p.created_at) {
        const diffMs = Date.now() - new Date(p.created_at).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) timeStr = 'Just now';
        else if (diffMins < 60) timeStr = `${diffMins}m ago`;
        else {
          const diffHours = Math.floor(diffMins / 60);
          if (diffHours < 24) timeStr = `${diffHours}h ago`;
          else timeStr = `${Math.floor(diffHours / 24)}d ago`;
        }
      }

      return `
        <div class="activity-item" style="cursor: pointer;" onclick="window.marbsApp.openPostDetailModal('${p.post_id}')">
          <img src="${p.image || 'assets/images.jpg'}" class="activity-thumb" alt="thumbnail" onerror="this.src='assets/images.jpg'">
          <div class="activity-info">
            <div class="activity-meta">
              <span class="activity-badge ${type}">${badge}</span>
              <span class="activity-time">${timeStr}</span>
            </div>
            <div class="activity-text">${escapeHtml(text)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 7. Interactive Koronadal Map Widget with Pins (Section 2, 7, 8, 15)
  function setupInteractiveMap() {
    const mapIframe = $('#googleMapIframe');
    const resetBtn = $('#recenterMapBtn');
    const citySelector = $('#mapCitySelector');

    // Geo coordinates for specific key zones in Koronadal City
    const koronadalZones = {
      'ALL': { lat: 6.5020, lon: 124.8480, delta: 0.038 },
      'City Proper': { lat: 6.5025, lon: 124.8475, delta: 0.015 },
      'Public Market': { lat: 6.4988, lon: 124.8440, delta: 0.012 },
      'Robinsons': { lat: 6.4912, lon: 124.8398, delta: 0.012 },
      'KCC': { lat: 6.5090, lon: 124.8510, delta: 0.012 },
      'KNCHS': { lat: 6.5050, lon: 124.8490, delta: 0.012 },
      'Notre Dame': { lat: 6.4970, lon: 124.8470, delta: 0.012 },
      'Zone': { lat: 6.5010, lon: 124.8530, delta: 0.020 }
    };

    function updateMapLocation(areaKey) {
      if (!mapIframe) return;
      const zone = koronadalZones[areaKey] || koronadalZones['ALL'];
      const minLon = (zone.lon - zone.delta).toFixed(4);
      const minLat = (zone.lat - zone.delta * 0.7).toFixed(4);
      const maxLon = (zone.lon + zone.delta).toFixed(4);
      const maxLat = (zone.lat + zone.delta * 0.7).toFixed(4);
      const markerLat = zone.lat.toFixed(4);
      const markerLon = zone.lon.toFixed(4);

      mapIframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${markerLat}%2C${markerLon}`;
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        updateMapLocation('ALL');
        currentArea = 'ALL';
        renderFeed();
        showToast('📍 Map reset to Koronadal City');
      });
    }

    if (citySelector) {
      citySelector.addEventListener('change', () => {
        updateMapLocation('ALL');
      });
    }

    // Expose map focal point update helper for areas tags
    window.setMapLocation = updateMapLocation;
  }

  // 8. Public Item Detail Modal & Privacy Enforcement (Section 11, 33)
  function setupPostModals() {
    $('#postDetailModalClose').addEventListener('click', () => {
      $('#postDetailModal').classList.remove('active');
    });

    $('#reportPostBtn').addEventListener('click', () => {
      if (activePostForModal) {
        openScamReportModal('POST', activePostForModal.post_id);
      }
    });

    // Default claim click is configured dynamically inside openPostDetailModal
    // for author verification review vs other citizen claim submission
  }

  function openPostDetailModal(postId) {
    const post = marbsDB.data.posts.find(p => p.post_id === postId);
    if (!post) return;

    activePostForModal = post;
    const modal = $('#postDetailModal');

    $('#modalPostTitle').textContent = post.item_name;
    $('#modalPostImage').src = post.image;

    // Multi-photo gallery handling in detail modal
    const postPhotos = (Array.isArray(post.images) && post.images.length > 0) ? post.images : (post.image ? [post.image] : []);
    const galleryStrip = $('#modalPhotoGalleryStrip');
    const indexBadge = $('#modalPhotoIndexBadge');

    if (galleryStrip && indexBadge) {
      if (postPhotos.length > 1) {
        galleryStrip.style.display = 'flex';
        indexBadge.style.display = 'inline-block';
        indexBadge.textContent = `1 / ${postPhotos.length}`;

        galleryStrip.innerHTML = postPhotos.map((imgSrc, i) => `
          <div onclick="window.marbsApp.setModalActivePhoto('${imgSrc}', ${i + 1}, ${postPhotos.length})" style="cursor: pointer; flex-shrink: 0; width: 64px; height: 64px; border-radius: var(--radius-sm); overflow: hidden; border: 2px solid ${i === 0 ? 'var(--primary-dark)' : 'var(--border)'}; background: #000;" class="modal-thumb-item" data-thumb-idx="${i}">
            <img src="${imgSrc}" style="width: 100%; height: 100%; object-fit: cover;" alt="thumb ${i + 1}">
          </div>
        `).join('');

        window.marbsApp.setModalActivePhoto = function(src, currentIdx, total) {
          $('#modalPostImage').src = src;
          indexBadge.textContent = `${currentIdx} / ${total}`;
          document.querySelectorAll('.modal-thumb-item').forEach((el, idx) => {
            el.style.borderColor = (idx === currentIdx - 1) ? 'var(--primary-dark)' : 'var(--border)';
          });
        };
      } else {
        galleryStrip.style.display = 'none';
        galleryStrip.innerHTML = '';
        indexBadge.style.display = 'none';
      }
    }

    $('#modalPostCategory').textContent = post.category;
    $('#modalPostType').textContent = post.post_type === 'LOST' ? 'Lost Item' : 'Found Item';
    $('#modalPostType').className = `post-badge ${post.post_type === 'LOST' ? 'badge-lost' : 'badge-found'}`;
    $('#modalPostLocation').textContent = post.general_location;
    $('#modalPostDate').textContent = `${post.date} at ${post.approximate_time || 'Approx time'}`;
    $('#modalPostDescription').textContent = post.description;

    // Identifying details for public
    $('#modalPostColor').textContent = post.color || 'Not specified';
    $('#modalPostBrand').textContent = post.brand || 'N/A';

    // Reward display adhering strictly to Section 24 (Reward Privacy)
    const rewardBox = $('#modalPostRewardBox');
    if (post.reward_offered) {
      rewardBox.style.display = 'block';
      if (post.reward_amount_private) {
        $('#modalRewardAmount').textContent = 'Reward Offered: Yes (Amount kept private until match)';
      } else {
        $('#modalRewardAmount').textContent = `Reward Offered: ₱${post.reward_amount.toLocaleString()}`;
      }
    } else {
      rewardBox.style.display = 'none';
    }

    // Camera Verification Badge
    const camBadge = $('#modalCameraVerifiedBadge');
    if (post.camera_verified) {
      camBadge.style.display = 'inline-flex';
      camBadge.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Verified Real-time Capture (Hash: ${post.photo_hash || 'OK'})`;
    } else {
      camBadge.style.display = 'none';
    }

    // Configure Claim Button vs Own Post Actions
    const claimBtn = $('#claimPostBtn');
    const currentUser = marbsDB.getCurrentUser();
    const isOwnPost = Boolean(currentUser && (
      (post.user_id && currentUser.user_id === post.user_id) ||
      (post.poster_id && currentUser.user_id === post.poster_id) ||
      (currentUser.user_id === 'USR-ADMIN' && (post.user_id === 'USR-ADMIN' || post.user_id === 'USR-GUEST'))
    ));

    if (claimBtn) {
      if (isOwnPost) {
        claimBtn.textContent = 'View Verification Answers';
        claimBtn.style.display = 'inline-flex';
        claimBtn.className = 'btn btn-primary';
        claimBtn.onclick = () => {
          $('#postDetailModal').classList.remove('active');
          window.openPostVerificationAnswers(post.post_id);
        };
      } else {
        claimBtn.style.display = 'inline-flex';
        claimBtn.className = 'btn btn-primary';
        if (post.post_type === 'LOST') {
          claimBtn.textContent = 'I Found This Item (Contact Owner)';
        } else {
          claimBtn.textContent = 'I Think This Is Mine (Verify Ownership)';
        }
        claimBtn.onclick = () => {
          $('#postDetailModal').classList.remove('active');
          openOwnershipClaimModal(post);
        };
      }
    }

    // Configure Delete Button in Modal
    const deleteBtn = $('#deletePostModalBtn');
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.onclick = () => {
        $('#postDetailModal').classList.remove('active');
        window.marbsApp.deletePost(post.post_id);
      };
    }

    modal.classList.add('active');
  }

  // 9. Camera Integration for Post and ID Creation (Section 9 & 4)
  function setupCameraTriggers() {
    $('#cameraModalClose').addEventListener('click', () => marbsCamera.close());
    $('#cameraSnapBtn').addEventListener('click', () => marbsCamera.snapPhoto());
    $('#cameraRetakeBtn').addEventListener('click', () => marbsCamera.retakePhoto());
    $('#cameraUseBtn').addEventListener('click', () => marbsCamera.usePhoto());

    // Trigger buttons from Forms
    // Lost Item: supports multiple file uploads and/or camera additions
    const lostUploadBtn = $('#lostUploadFileBtn');
    const lostCameraBtn = $('#lostCameraOpenBtn');
    const lostFileInput = $('#lostFileInput');

    function renderLostPhotosPreview() {
      const grid = $('#lostPhotosPreviewGrid');
      const badge = $('#lostPhotoCountBadge');
      const prompt = $('#lostCameraPrompt');
      const hashtag = $('#lostPhotoHashTag');
      if (!grid) return;

      if (lostUploadedPhotos.length === 0) {
        grid.style.display = 'none';
        grid.innerHTML = '';
        if (badge) badge.style.display = 'none';
        if (prompt) prompt.style.display = 'block';
        if (hashtag) hashtag.style.display = 'none';
        return;
      }

      grid.style.display = 'grid';
      if (prompt) prompt.style.display = 'none';
      if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = `${lostUploadedPhotos.length} Photo${lostUploadedPhotos.length > 1 ? 's' : ''} Attached`;
      }
      if (hashtag) {
        hashtag.style.display = 'block';
        hashtag.textContent = `✓ ${lostUploadedPhotos.length} secure photo${lostUploadedPhotos.length > 1 ? 's' : ''} ready for review`;
      }

      grid.innerHTML = lostUploadedPhotos.map((item, idx) => `
        <div style="position: relative; border-radius: var(--radius-sm); overflow: hidden; background: #000; height: 80px; border: 1px solid var(--border);">
          <img src="${item.image_data}" alt="Photo ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
          <span style="position: absolute; bottom: 2px; left: 4px; background: rgba(0,0,0,0.65); color: #fff; font-size: 10px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">#${idx + 1}</span>
          <button type="button" onclick="event.stopPropagation(); window.marbsApp.removeLostPhoto(${idx});" style="position: absolute; top: 2px; right: 2px; background: rgba(239, 68, 68, 0.85); color: #fff; border: none; width: 18px; height: 18px; border-radius: 50%; font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;">×</button>
        </div>
      `).join('');
    }

    window.marbsApp = window.marbsApp || {};
    window.marbsApp.removeLostPhoto = function(index) {
      lostUploadedPhotos.splice(index, 1);
      renderLostPhotosPreview();
    };

    if (lostUploadBtn && lostFileInput) {
      lostUploadBtn.addEventListener('click', () => lostFileInput.click());
      lostFileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        let loadedCount = 0;
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = function (evt) {
            lostUploadedPhotos.push({
              image_data: evt.target.result,
              image_hash: 'UPLOAD-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
              timestamp: new Date().toISOString()
            });
            loadedCount++;
            if (loadedCount === files.length) {
              renderLostPhotosPreview();
              showToast(`✓ ${files.length} photo${files.length > 1 ? 's' : ''} added!`);
              lostFileInput.value = ''; // reset so same files can be re-selected if needed
            }
          };
          reader.readAsDataURL(file);
        });
      });
    }

    if (lostCameraBtn) {
      lostCameraBtn.addEventListener('click', () => {
        activeCameraContext = 'lost';
        marbsCamera.open({
          category: 'lost_item',
          onCapture: handlePhotoCaptured
        });
      });
    }

    // Default trigger box on Lost item form
    $('#reportLostCameraTrigger').addEventListener('click', () => {
      if (lostFileInput) lostFileInput.click();
    });

    $('#reportFoundCameraTrigger').addEventListener('click', () => {
      activeCameraContext = 'found';
      marbsCamera.open({
        category: 'found_item',
        onCapture: handlePhotoCaptured
      });
    });

    const openIdCamera = () => {
      activeCameraContext = 'id';
      marbsCamera.open({
        category: 'identity_doc',
        onCapture: handlePhotoCaptured
      });
    };

    if ($('#verifyIdCameraTrigger')) $('#verifyIdCameraTrigger').addEventListener('click', openIdCamera);
    if ($('#verifyIdCameraBtn')) $('#verifyIdCameraBtn').addEventListener('click', openIdCamera);

    // ID File Upload option
    const idFileInput = $('#idFileInput');
    const verifyIdUploadBtn = $('#verifyIdUploadBtn');
    if (verifyIdUploadBtn && idFileInput) {
      verifyIdUploadBtn.addEventListener('click', () => idFileInput.click());
      idFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
          const base64Data = evt.target.result;
          activeCameraContext = 'id';
          handlePhotoCaptured({
            image_data: base64Data,
            image_hash: 'UPLOAD-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
            timestamp: new Date().toISOString()
          });
          showToast('✓ ID image uploaded successfully!');
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function handlePhotoCaptured(payload) {
    capturedPhotoPayload = payload;

    if (activeCameraContext === 'lost') {
      // Append captured camera photo to lostUploadedPhotos list
      lostUploadedPhotos.push(payload);
      const grid = $('#lostPhotosPreviewGrid');
      const badge = $('#lostPhotoCountBadge');
      const prompt = $('#lostCameraPrompt');
      const hashtag = $('#lostPhotoHashTag');

      if (grid) {
        grid.style.display = 'grid';
        if (prompt) prompt.style.display = 'none';
        if (badge) {
          badge.style.display = 'inline-block';
          badge.textContent = `${lostUploadedPhotos.length} Photo${lostUploadedPhotos.length > 1 ? 's' : ''} Attached`;
        }
        if (hashtag) {
          hashtag.style.display = 'block';
          hashtag.textContent = `✓ ${lostUploadedPhotos.length} secure photo${lostUploadedPhotos.length > 1 ? 's' : ''} ready for review`;
        }
        grid.innerHTML = lostUploadedPhotos.map((item, idx) => `
          <div style="position: relative; border-radius: var(--radius-sm); overflow: hidden; background: #000; height: 80px; border: 1px solid var(--border);">
            <img src="${item.image_data}" alt="Photo ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
            <span style="position: absolute; bottom: 2px; left: 4px; background: rgba(0,0,0,0.65); color: #fff; font-size: 10px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">#${idx + 1}</span>
            <button type="button" onclick="event.stopPropagation(); window.marbsApp.removeLostPhoto(${idx});" style="position: absolute; top: 2px; right: 2px; background: rgba(239, 68, 68, 0.85); color: #fff; border: none; width: 18px; height: 18px; border-radius: 50%; font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;">×</button>
          </div>
        `).join('');
      }
    } else if (activeCameraContext === 'found') {
      $('#foundPhotoPreview').src = payload.image_data;
      $('#foundPhotoPreview').style.display = 'block';
      $('#foundCameraPrompt').style.display = 'none';
      $('#foundPhotoHashTag').textContent = `✓ Proof Hash: ${payload.image_hash} (Camera Verified)`;
      $('#foundPhotoHashTag').style.display = 'block';
    } else if (activeCameraContext === 'id') {
      $('#idPhotoPreview').src = payload.image_data;
      $('#idPhotoPreview').style.display = 'block';
      $('#idCameraPrompt').style.display = 'none';
      $('#idPhotoHashTag').textContent = `✓ Secure Document Capture Hash: ${payload.image_hash}`;
      $('#idPhotoHashTag').style.display = 'block';
    } else if (activeCameraContext === 'claim_proof') {
      handleClaimPhotoCaptured(payload);
      return;
    }

    showToast('✓ Photo captured and watermarked with MarbsLF timestamp!');
  }

  function handleClaimPhotoCaptured(payload) {
    claimPhotoPayload = payload;
    const previewContainer = $('#claimPhotoPreviewContainer');
    const emptyState = $('#claimPhotoEmptyState');
    const previewImg = $('#claimPhotoPreviewImg');
    const badge = $('#claimPhotoBadge');
    const timestamp = $('#claimPhotoTimestamp');

    if (previewImg) previewImg.src = payload.image_data;
    if (badge) {
      if (payload.camera_verification_status === 'GALLERY_UPLOAD') {
        badge.textContent = '📁 PHOTO ATTACHED';
        badge.style.background = '#e0f2fe';
        badge.style.color = '#0369a1';
      } else {
        badge.textContent = '✓ LIVE CAMERA PROOF';
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
      }
    }
    if (timestamp) {
      const timeStr = new Date(payload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timestamp.textContent = `Captured: ${timeStr} • Hash: ${payload.image_hash || 'SECURE'}`;
    }
    if (previewContainer) previewContainer.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';

    showToast('✓ Proof photo captured successfully!');
  }

  function resetClaimPhotoUI() {
    claimPhotoPayload = null;
    const previewContainer = $('#claimPhotoPreviewContainer');
    const emptyState = $('#claimPhotoEmptyState');
    const previewImg = $('#claimPhotoPreviewImg');
    const fileInput = $('#claimPhotoFileInput');
    if (previewImg) previewImg.src = '';
    if (fileInput) fileInput.value = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
  }

  // Helper: check if user is verified
  function checkUserVerification(user, actionDesc = 'post or claim') {
    if (!user) {
      openLoginModal();
      showToast('Please log in or create an account first.');
      return false;
    }

    if (user.role === 'ADMIN') return true;

    // Self-healing check: check if already verified directly or in id_verifications
    if (user.verification_status === 'VERIFIED') return true;

    if (window.marbsDB && Array.isArray(window.marbsDB.data.id_verifications)) {
      const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
      const approvedVer = window.marbsDB.data.id_verifications.find(v => {
        if (v.status !== 'VERIFIED') return false;
        const isUserMatch = v.user_id && (v.user_id === user.user_id || v.user_id === user.email);
        const isNameMatch = v.full_legal_name && v.full_legal_name.trim().toLowerCase() === userFullName;
        return isUserMatch || isNameMatch;
      });

      if (approvedVer) {
        user.verification_status = 'VERIFIED';
        window.marbsDB.save();
        return true;
      }
    }

    // If still not verified, show friendly guidance modal
    showToast('⚠️ Verify first before you can post or claim');
    showNotificationModal({
      title: 'Identity Verification Required',
      message: `Verify first before you can ${actionDesc}. Under Section 4 security rules, users must complete identity verification (PhilSys, School ID, Driver's License, or Passport) to prevent fraud and protect citizens.`,
      btnText: 'Verify Identity Now',
      onAction: () => {
        $('#idVerificationModal').classList.add('active');
      }
    });
    return false;
  }

  // 10. Reporting Lost Item (Section 7, 9, 10, 23, 24)
  window.marbsApp = {
    openReportModal: function (type) {
      const user = marbsDB.getCurrentUser();
      if (!checkUserVerification(user, 'post a lost or found item')) {
        return;
      }

      if (type === 'LOST') {
        $('#reportLostModal').classList.add('active');
      } else {
        $('#reportFoundModal').classList.add('active');
      }
    },

    openPostDetailModal: openPostDetailModal,

    deletePost: function (postId) {
      const user = marbsDB.getCurrentUser();
      if (!user) {
        openLoginModal();
        return;
      }

      const postIndex = marbsDB.data.posts.findIndex(p => p.post_id === postId);
      if (postIndex === -1) {
        showToast('Post not found or already deleted.');
        return;
      }

      const targetPost = marbsDB.data.posts[postIndex];

      // If logged in, check role or ownership; if post has no owner or guest, allow deletion
      if (user && targetPost.user_id && targetPost.user_id !== user.user_id && user.role !== 'ADMIN' && targetPost.user_id !== 'USR-GUEST') {
        const canDelete = confirm(`Notice: You are not recorded as the original creator of this post. As a test/moderator action, do you still wish to permanently delete "${targetPost.item_name}" from the database?`);
        if (!canDelete) return;
      } else {
        const confirmed = confirm(`Are you sure you want to delete "${targetPost.item_name}"? This action will permanently remove it from the database.`);
        if (!confirmed) return;
      }

      // Remove from array
      marbsDB.data.posts.splice(postIndex, 1);

      // Remove related matches
      if (marbsDB.data.matches) {
        marbsDB.data.matches = marbsDB.data.matches.filter(m => m.lost_post_id !== postId && m.found_post_id !== postId);
      }

      marbsDB.logAudit('POST_DELETION', `User ${user.user_id} deleted post ${postId} (${targetPost.item_name})`);
      marbsDB.save();

      // Delete from Firestore if connected
      if (window.firestoreDb) {
        try {
          window.firestoreDb.collection('posts').doc(postId).delete().catch(e => console.warn('Firestore delete note:', e));
        } catch (e) {
          console.warn('Firestore delete note:', e);
        }
      }

      // Refresh UI
      renderFeed();
      renderRecentActivity();
      renderUserDashboard();
      if (user.role === 'ADMIN' && typeof renderAdminPortal === 'function') {
        renderAdminPortal();
      }

      showToast(`🗑️ "${targetPost.item_name}" was successfully deleted.`);
    },

    handlePostAction: function (postId) {
      const user = marbsDB.getCurrentUser();
      if (!user) {
        openLoginModal();
        showToast('Please log in or create an account to verify ownership.');
        return;
      }
      const post = marbsDB.data.posts.find(p => p.post_id === postId);
      if (!post) return;

      const isOwnPost = Boolean(
        (post.user_id && user.user_id === post.user_id) ||
        (post.poster_id && user.user_id === post.poster_id) ||
        (user.user_id === 'USR-ADMIN' && (post.user_id === 'USR-ADMIN' || post.user_id === 'USR-GUEST'))
      );

      if (isOwnPost) {
        window.openPostVerificationAnswers(postId);
        return;
      }

      openOwnershipClaimModal(post);
    },

    toggleLike: function (postId) {
      const res = marbsDB.togglePostReaction(postId);
      const btn = document.getElementById(`like-btn-${postId}`);
      const countEl = document.getElementById(`like-count-${postId}`);
      if (btn && countEl) {
        const heartSpan = btn.querySelector('.heart-icon');
        if (res.liked) {
          btn.classList.add('liked');
          if (heartSpan) heartSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        } else {
          btn.classList.remove('liked');
          if (heartSpan) heartSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        }
        countEl.textContent = res.count;
      }
    }
  };

  // Setup Form Submissions
  const lostForm = $('#reportLostForm');
  if (lostForm) {
    lostForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = marbsDB.getCurrentUser();

      const category = $('#lostCategory').value;
      const itemName = $('#lostItemName').value.trim();
      const description = $('#lostDescription').value.trim();
      const dateLost = $('#lostDate').value;
      const timeLost = $('#lostTime').value;
      const color = $('#lostColor').value.trim();
      const brand = $('#lostBrand').value.trim();
      const model = $('#lostModel').value.trim();
      const serial = $('#lostSerial').value.trim();
      const location = $('#lostLocation').value.trim();
      const hasReward = $('#lostRewardToggle').checked;
      const rewardAmount = parseFloat($('#lostRewardAmount').value) || 0;
      const hideReward = $('#lostRewardPrivacy').checked;

      const newPostId = 'POST-' + Date.now().toString().slice(-4);
      const post = {
        post_id: newPostId,
        user_id: user.user_id,
        post_type: 'LOST',
        category: category,
        item_name: itemName,
        pet_type: category === 'Pets' ? 'Pet' : '',
        description: description,
        date: dateLost || new Date().toISOString().split('T')[0],
        approximate_time: timeLost || 'Not specified',
        color: color,
        brand: brand,
        model: model,
        serial_number_private: serial,
        general_location: location,
        private_coordinates: { lat: 6.5028, lng: 124.8468, address_notes: location },
        status: 'PENDING_REVIEW', // Moderation workflow: SUBMITTED -> PENDING REVIEW -> APPROVED
        reward_status: hasReward ? 'REWARD_OFFERED' : 'NO_REWARD',
        reward_offered: hasReward,
        reward_amount: rewardAmount,
        reward_amount_private: hideReward,
        image: (lostUploadedPhotos.length > 0) ? lostUploadedPhotos[0].image_data : (capturedPhotoPayload ? capturedPhotoPayload.image_data : 'assets/images.jpg'),
        images: (lostUploadedPhotos.length > 0) ? lostUploadedPhotos.map(p => p.image_data) : (capturedPhotoPayload ? [capturedPhotoPayload.image_data] : []),
        camera_verified: lostUploadedPhotos.some(p => p.image_hash && !p.image_hash.startsWith('UPLOAD-')) || !!(capturedPhotoPayload && !capturedPhotoPayload.image_hash.startsWith('UPLOAD-')),
        photo_hash: (lostUploadedPhotos.length > 0) ? lostUploadedPhotos.map(p => p.image_hash).join(', ') : (capturedPhotoPayload ? capturedPhotoPayload.image_hash : 'NO_PHOTO_HASH'),
        likes_count: 0,
        created_at: new Date().toISOString()
      };

      marbsDB.data.posts.unshift(post);
      marbsDB.logAudit('POST_SUBMISSION', `User ${user.user_id} submitted lost post ${newPostId} (${itemName}) - Pending Admin Review`);
      marbsDB.save();
      if (marbsDB.syncPostToFirestore) marbsDB.syncPostToFirestore(post);

      // Trigger automatic matching engine per Section 12
      runMatchingEngineForPost(post);

      $('#reportLostModal').classList.remove('active');
      lostForm.reset();
      capturedPhotoPayload = null;
      lostUploadedPhotos = [];
      const previewGrid = $('#lostPhotosPreviewGrid');
      if (previewGrid) {
        previewGrid.style.display = 'none';
        previewGrid.innerHTML = '';
      }
      const countBadge = $('#lostPhotoCountBadge');
      if (countBadge) countBadge.style.display = 'none';
      const promptEl = $('#lostCameraPrompt');
      if (promptEl) promptEl.style.display = 'block';
      const hashEl = $('#lostPhotoHashTag');
      if (hashEl) hashEl.style.display = 'none';

      showNotificationModal({
        title: 'Report Submitted for Admin Review',
        message: 'Your report has been received! Under Section 10 Post Moderation, an Administrator will review the details. Once approved, it will be published publicly.',
        btnText: 'Understood',
        onAction: () => navigateToView('dashboard')
      });

      renderFeed();
      renderRecentActivity();
      renderUserDashboard();
      renderUserPill();
      updateNotificationBadges();
    });
  }

  // Setup Report Found Form
  const foundForm = $('#reportFoundForm');
  if (foundForm) {
    foundForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = marbsDB.getCurrentUser();

      const category = $('#foundCategory').value;
      const itemName = $('#foundItemName').value.trim();
      const description = $('#foundDescription').value.trim();
      const dateFound = $('#foundDate').value;
      const timeFound = $('#foundTime').value;
      const color = $('#foundColor').value.trim();
      const brand = $('#foundBrand').value.trim();
      const location = $('#foundLocation').value.trim();

      // Strict enforcement: Found items MUST use the device camera
      if (!capturedPhotoPayload || activeCameraContext !== 'found' || !capturedPhotoPayload.image_data) {
        alert('🔒 Device Camera Required:\n\nTo prevent fake claims and verify authenticity in Koronadal City, Found Items MUST be photographed right now using your device camera.\n\nPlease click "Open Device Camera & Snap Found Item".');
        marbsCamera.open({
          category: 'found_item',
          onCapture: handlePhotoCaptured
        });
        return;
      }

      const newPostId = 'POST-' + Date.now().toString().slice(-4);
      const post = {
        post_id: newPostId,
        user_id: user.user_id,
        post_type: 'FOUND',
        category: category,
        item_name: itemName,
        description: description,
        date: dateFound || new Date().toISOString().split('T')[0],
        approximate_time: timeFound || 'Not specified',
        color: color,
        brand: brand,
        model: brand,
        serial_number_private: '',
        general_location: location,
        private_coordinates: { lat: 6.5028, lng: 124.8468, address_notes: location },
        status: 'PENDING_REVIEW', // Moderation workflow: SUBMITTED -> PENDING REVIEW -> APPROVED
        reward_status: 'NO_REWARD',
        reward_offered: false,
        reward_amount: 0,
        reward_amount_private: true,
        image: capturedPhotoPayload ? capturedPhotoPayload.image_data : 'assets/images.jpg',
        camera_verified: !!capturedPhotoPayload,
        photo_hash: capturedPhotoPayload ? capturedPhotoPayload.image_hash : 'NO_PHOTO_HASH',
        likes_count: 0,
        created_at: new Date().toISOString()
      };

      marbsDB.data.posts.unshift(post);
      marbsDB.logAudit('POST_SUBMISSION', `User ${user.user_id} submitted found post ${newPostId} (${itemName}) - Pending Admin Review`);
      marbsDB.save();
      if (marbsDB.syncPostToFirestore) marbsDB.syncPostToFirestore(post);

      runMatchingEngineForPost(post);

      $('#reportFoundModal').classList.remove('active');
      foundForm.reset();
      capturedPhotoPayload = null;

      showNotificationModal({
        title: 'Found Report Submitted for Admin Review',
        message: 'Thank you for your civic contribution! Under Section 10 Post Moderation, an Administrator will verify the details. Once approved, it will be published publicly and your +10 Marbs Points bonus will be awarded.',
        btnText: 'Understood',
        onAction: () => navigateToView('dashboard')
      });

      renderFeed();
      renderRecentActivity();
      renderUserDashboard();
      renderUserPill();
      updateNotificationBadges();
    });
  }

  // 11. Search and Matching System Engine (Section 12)
  function runMatchingEngineForPost(newPost) {
    const isLost = newPost.post_type === 'LOST';
    const targetType = isLost ? 'FOUND' : 'LOST';

    // Find opposite posts with similar category, color, or location
    const candidates = marbsDB.data.posts.filter(p => p.post_type === targetType && p.category === newPost.category);

    candidates.forEach(candidate => {
      let score = 50; // Category match baseline
      if (candidate.color && newPost.color && candidate.color.toLowerCase() === newPost.color.toLowerCase()) {
        score += 25;
      }
      if (candidate.general_location && newPost.general_location &&
        (candidate.general_location.toLowerCase().includes('kcc') && newPost.general_location.toLowerCase().includes('kcc') ||
          candidate.general_location.toLowerCase().includes('market') && newPost.general_location.toLowerCase().includes('market'))) {
        score += 20;
      }

      if (score >= 60) {
        const match = {
          match_id: 'MAT-' + Date.now().toString().slice(-5),
          lost_post_id: isLost ? newPost.post_id : candidate.post_id,
          found_post_id: isLost ? candidate.post_id : newPost.post_id,
          claimant_id: isLost ? newPost.user_id : candidate.user_id,
          status: 'POTENTIAL_MATCH',
          match_score: score,
          qna_responses: {},
          created_at: new Date().toISOString()
        };
        marbsDB.data.matches.unshift(match);

        // Notify both owners
        marbsDB.addNotification(newPost.user_id, 'Potential Match Identified!', `The MarbsLF matching engine discovered a possible match for "${newPost.item_name}".`, 'MATCH');
        marbsDB.addNotification(candidate.user_id, 'Potential Match Identified!', `The MarbsLF matching engine discovered a possible match for "${candidate.item_name}".`, 'MATCH');
      }
    });

    marbsDB.save();
  }

  // 12. Ownership Verification Questionnaire (Section 13)
  function setupOwnershipClaim() {
    $('#ownershipClaimClose').addEventListener('click', () => {
      $('#ownershipClaimModal').classList.remove('active');
    });

    // Camera & Upload Triggers for Verification Claim
    const claimCamBtn = $('#claimCameraOpenBtn');
    if (claimCamBtn) {
      claimCamBtn.addEventListener('click', () => {
        activeCameraContext = 'claim_proof';
        if (window.marbsCamera) {
          window.marbsCamera.open({
            category: 'verification_proof',
            onCapture: handleClaimPhotoCaptured
          });
        }
      });
    }

    const claimUploadBtn = $('#claimUploadFileBtn');
    const claimFileInput = $('#claimPhotoFileInput');
    if (claimUploadBtn && claimFileInput) {
      claimUploadBtn.addEventListener('click', () => claimFileInput.click());
      claimFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          handleClaimPhotoCaptured({
            image_data: evt.target.result,
            image_hash: 'UPLOAD-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
            camera_verification_status: 'GALLERY_UPLOAD',
            timestamp: new Date().toISOString()
          });
        };
        reader.readAsDataURL(file);
      });
    }

    const claimRetakeBtn = $('#claimPhotoRetakeBtn');
    if (claimRetakeBtn) {
      claimRetakeBtn.addEventListener('click', () => {
        activeCameraContext = 'claim_proof';
        if (window.marbsCamera) {
          window.marbsCamera.open({
            category: 'verification_proof',
            onCapture: handleClaimPhotoCaptured
          });
        }
      });
    }

    const claimRemoveBtn = $('#claimPhotoRemoveBtn');
    if (claimRemoveBtn) {
      claimRemoveBtn.addEventListener('click', () => {
        resetClaimPhotoUI();
      });
    }

    const claimForm = $('#ownershipClaimForm');
    if (claimForm) {
      claimForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = marbsDB.getCurrentUser();
        if (!activePostForModal) return;

        const getVal = (id) => {
          const el = document.getElementById(id);
          return el ? el.value.trim() : '';
        };

        const answers = {
          location_lost: getVal('claimAnswerLocation'),
          approx_time: getVal('claimAnswerTime'),
          color: getVal('claimAnswerColor'),
          identifying_marks: getVal('claimAnswerMarks'),
          accessories: getVal('claimAnswerAccessories'),
          inside_contents: getVal('claimAnswerContents'),
          private_proof: getVal('claimAnswerProof'),
          proof_photo_url: claimPhotoPayload ? claimPhotoPayload.image_data : null,
          proof_photo_hash: claimPhotoPayload ? claimPhotoPayload.image_hash : null,
          camera_verification_status: claimPhotoPayload ? claimPhotoPayload.camera_verification_status : null,
          proof_timestamp: claimPhotoPayload ? claimPhotoPayload.timestamp : null
        };

        const isFoundPost = activePostForModal.post_type === 'FOUND';

        const newMatch = {
          match_id: 'MAT-' + Date.now().toString().slice(-5),
          lost_post_id: isFoundPost ? 'CLAIM-' + Date.now() : activePostForModal.post_id,
          found_post_id: isFoundPost ? activePostForModal.post_id : 'FOUND_MATCH-' + Date.now(),
          claimant_id: user.user_id,
          status: 'VERIFICATION_IN_PROGRESS',
          match_score: claimPhotoPayload ? 95 : 90,
          qna_responses: answers,
          proof_photo_url: claimPhotoPayload ? claimPhotoPayload.image_data : null,
          proof_photo_hash: claimPhotoPayload ? claimPhotoPayload.image_hash : null,
          camera_verification_status: claimPhotoPayload ? claimPhotoPayload.camera_verification_status : null,
          created_at: new Date().toISOString()
        };

        marbsDB.data.matches.unshift(newMatch);

        // Add private message thread reference per Section 14
        marbsDB.data.messages.push({
          message_id: 'MSG-' + Date.now().toString().slice(-4),
          sender_id: user.user_id,
          receiver_id: activePostForModal.user_id || 'USR-ADMIN',
          post_id: activePostForModal.post_id,
          message: isFoundPost 
            ? `[System Notice] User ${user.public_alias || user.first_name} submitted an ownership claim with private identifying answers ${claimPhotoPayload ? 'and verified camera photo proof ' : ''}for your found item.`
            : `[System Notice] User ${user.public_alias || user.first_name} reported that they found your lost item with identifying details ${claimPhotoPayload ? 'and live camera photo proof' : ''}.`,
          timestamp: new Date().toISOString(),
          status: 'UNREAD'
        });

        // Notify poster
        if (activePostForModal.user_id) {
          marbsDB.addNotification(
            activePostForModal.user_id,
            isFoundPost ? 'New Ownership Claim Received' : 'Found Match Lead Received',
            isFoundPost 
              ? `A user submitted ownership proof answers ${claimPhotoPayload ? 'with photo proof ' : ''}for your found post "${activePostForModal.item_name}".`
              : `A user reported finding an item matching your lost post "${activePostForModal.item_name}".`,
            'CLAIM'
          );
        }

        marbsDB.save();
        $('#ownershipClaimModal').classList.remove('active');
        claimForm.reset();
        resetClaimPhotoUI();

        showToast(isFoundPost 
          ? '✓ Claim submitted! The finder has been notified to review your proof answers and photo.'
          : '✓ Details submitted! The owner has been notified of your report and photo proof.');
      });
    }
  }

  function openOwnershipClaimModal(post) {
    const user = marbsDB.getCurrentUser();
    if (!user) {
      openLoginModal();
      return;
    }

    const isOwnPost = Boolean(
      (post.user_id && user.user_id === post.user_id) ||
      (post.poster_id && user.user_id === post.poster_id) ||
      (user.user_id === 'USR-ADMIN' && (post.user_id === 'USR-ADMIN' || post.user_id === 'USR-GUEST'))
    );

    if (isOwnPost) {
      showToast('You cannot claim your own post. Viewing private verification answers instead.');
      window.openPostVerificationAnswers(post.post_id);
      return;
    }

    if (!checkUserVerification(user, post.post_type === 'LOST' ? 'report finding this item' : 'claim this found item')) {
      return;
    }

    activePostForModal = post;
    const isLost = post.post_type === 'LOST';

    $('#claimModalItemName').textContent = post.item_name;
    resetClaimPhotoUI();

    // Dynamically align questions with whether this is a Found post or Lost post
    const q1Label = $('#claimLabelLocation');
    const q1Input = $('#claimAnswerLocation');
    const q2Label = $('#claimLabelTime');
    const q2Input = $('#claimAnswerTime');
    const q6Label = $('#claimLabelProof');
    const q6Input = $('#claimAnswerProof');
    const q7Label = $('#claimLabelPhoto');
    const q7Help = $('#claimPhotoHelpText');
    const camBtn = $('#claimCameraOpenBtn');

    if (isLost) {
      // User is responding to a LOST post ("Found This?")
      if (q1Label) q1Label.textContent = '1. Where did you find this item in Koronadal? *';
      if (q1Input) q1Input.placeholder = 'e.g. Near KCC Mall 2nd Floor or KNCHS Main Gate';
      if (q2Label) q2Label.textContent = '2. Approximately when did you find it? *';
      if (q2Input) q2Input.placeholder = 'e.g. Yesterday afternoon around 3:30 PM';
      if (q6Label) q6Label.textContent = '6. Details confirming this matches the owner\'s lost item: *';
      if (q6Input) q6Input.placeholder = 'e.g. Current condition, exact custody location or turned over place';
      if (q7Label) q7Label.innerHTML = '<span>7. Live Photo Proof of Found Item (Recommended)</span><span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">Live Camera or Upload</span>';
      if (q7Help) q7Help.textContent = 'Capture the item you found right now using your website camera to prove physical possession, or upload a clear photo.';
      if (camBtn) camBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Capture Found Item with Camera';
    } else {
      // User is claiming a FOUND post ("I Think This Is Mine")
      if (q1Label) q1Label.textContent = '1. Where did you lose your item in Koronadal? *';
      if (q1Input) q1Input.placeholder = 'e.g. Beside tricycle terminal in Public Market';
      if (q2Label) q2Label.textContent = '2. Approximately when did you lose it? *';
      if (q2Input) q2Input.placeholder = 'e.g. Wednesday morning around 10:30 AM';
      if (q6Label) q6Label.textContent = '6. What specific secret proof proves it belongs to you? *';
      if (q6Input) q6Input.placeholder = 'e.g. Lock screen wallpaper photo, unique scratch, serial number ending in 4920';
      if (q7Label) q7Label.innerHTML = '<span>7. Live Photo Proof / Camera Verification (Recommended)</span><span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">Live Camera or Upload</span>';
      if (q7Help) q7Help.textContent = 'Capture matching ownership proof (e.g. receipt, spare accessory, old photo with item, or matching set) using your camera, or upload a photo.';
      if (camBtn) camBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Capture with Website Camera';
    }

    $('#ownershipClaimModal').classList.add('active');
  }

  // 13. Safe Pickup Places & Meetup Scheduling (Section 15, 16)
  function setupMeetupAndReturnSystem() {
    $('#meetupModalClose').addEventListener('click', () => {
      $('#meetupModal').classList.remove('active');
    });

    const safePlaceSelect = $('#meetupSafePlaceSelect');
    if (safePlaceSelect) {
      safePlaceSelect.innerHTML = marbsDB.data.safe_places
        .filter(sp => sp.active_status === 'ACTIVE')
        .map(sp => `<option value="${sp.place_id}">${sp.name} — ${sp.operating_hours}</option>`)
        .join('');
    }

    const meetupForm = $('#meetupScheduleForm');
    if (meetupForm) {
      meetupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = marbsDB.getCurrentUser();
        const placeId = $('#meetupSafePlaceSelect').value;
        const date = $('#meetupDate').value;
        const time = $('#meetupTime').value;
        const place = marbsDB.data.safe_places.find(p => p.place_id === placeId);

        const currentMatchId = window._activeSchedulingMatchId || 'MAT-1001';
        const currentMatch = (marbsDB.data.matches || []).find(m => m.match_id === currentMatchId);
        const currentPostId = window._activeSchedulingPostId || (currentMatch ? (currentMatch.lost_post_id || currentMatch.found_post_id) : (activeChatPost ? activeChatPost.post_id : 'POST-002'));
        const currentFinderId = window._activeSchedulingClaimantId || (currentMatch ? currentMatch.claimant_id : 'USR-102');

        const meetup = {
          meetup_id: 'MT-' + Date.now().toString().slice(-4),
          match_id: currentMatchId,
          post_id: currentPostId,
          owner_id: user ? user.user_id : 'USR-101',
          finder_id: currentFinderId,
          place_id: placeId,
          place_name: place ? place.name : 'Koronadal City Hall',
          date: date,
          time: time,
          status: 'CONFIRMED',
          owner_confirmed_return: false,
          finder_confirmed_return: false,
          safety_acknowledged: true,
          created_at: new Date().toISOString()
        };

        marbsDB.data.meetups.unshift(meetup);
        marbsDB.logAudit('MEETUP_SCHEDULED', `Meetup ${meetup.meetup_id} scheduled at ${meetup.place_name}`);
        marbsDB.save();

        $('#meetupModal').classList.remove('active');
        showToast('✓ Public Meetup Confirmed! Please review safety instructions.');
        renderUserDashboard();
        renderMeetupsView();
        updateNotificationBadges();
      });
    }
  }

  // 14. 2-Way Handshake Return Confirmation (Section 17, 19, 20, 23, 29)
  window.confirmReturnStep = function (meetupId, actionRole) {
    const meetup = marbsDB.data.meetups.find(m => m.meetup_id === meetupId);
    if (!meetup) return;

    if (actionRole === 'OWNER') {
      meetup.owner_confirmed_return = true;
      showToast('✓ Owner confirmed: "ITEM RECEIVED"');
    } else if (actionRole === 'FINDER') {
      meetup.finder_confirmed_return = true;
      showToast('✓ Finder confirmed: "ITEM RETURNED"');
    }

    // Both parties confirmed! Trigger Return Completed & Points & Rewards
    if (meetup.owner_confirmed_return && meetup.finder_confirmed_return) {
      meetup.status = 'COMPLETED';

      // Update associated post status to RESOLVED
      const post = marbsDB.data.posts.find(p => p.post_id === meetup.post_id);
      if (post) {
        post.status = 'RESOLVED';
        if (post.reward_offered) {
          post.reward_status = 'REWARD_RELEASED';
        }
      }

      // Award Marbs Points (+100 for verified return, +150 if pet)
      const isPet = post && post.category === 'Pets';
      const pointsToAward = isPet ? 150 : 100;

      const finder = marbsDB.data.users.find(u => u.user_id === meetup.finder_id);
      if (finder) {
        finder.points_balance += pointsToAward;
      }

      // Record Points Transaction per Section 21
      marbsDB.data.points_transactions.unshift({
        transaction_id: 'TX-' + Date.now().toString().slice(-4),
        user_id: meetup.finder_id,
        amount: pointsToAward,
        transaction_type: 'EARNED',
        reason: isPet ? 'Verified Pet Reunion (+150 MP)' : 'Verified Successful Item Return (+100 MP)',
        related_post_id: meetup.post_id,
        date: new Date().toISOString(),
        status: 'APPROVED'
      });

      marbsDB.logAudit('RETURN_COMPLETED', `Meetup ${meetupId} successfully confirmed by both parties. Awarded ${pointsToAward} MP to ${meetup.finder_id}`);

      // Offer Optional "Thank The Finder" Bonus prompt per Section 29
      showThankFinderPrompt(meetup.finder_id);
    }

    marbsDB.save();
    renderUserDashboard();
  };

  function showThankFinderPrompt(finderId) {
    showNotificationModal({
      title: '🎉 Item Return Complete!',
      message: 'Both parties confirmed the return! The finder was awarded legitimate Marbs Points. Would you like to award an extra +10 MP "Thank the Finder" bonus?',
      btnText: 'Send +10 MP Thank You Bonus',
      onAction: () => {
        const finder = marbsDB.data.users.find(u => u.user_id === finderId);
        if (finder) {
          finder.points_balance += 10;
          marbsDB.data.points_transactions.unshift({
            transaction_id: 'TX-' + Date.now().toString().slice(-4),
            user_id: finderId,
            amount: 10,
            transaction_type: 'EARNED',
            reason: 'Thank The Finder Bonus (+10 MP)',
            related_post_id: 'N/A',
            date: new Date().toISOString(),
            status: 'APPROVED'
          });
          marbsDB.save();
          showToast('✓ Sent +10 MP Thank-You bonus to the finder!');
        }
      }
    });
  }

  // 15. Real-Time Messenger & Anti-Scam Filter (Facebook Messenger & Marketplace Style)
  let activeChatCounterpartyId = null;
  let messengerPollingTimer = null;

  /**
   * Citizen reliability rating, derived ONLY from ratings actually submitted
   * after a confirmed safe transaction. A brand-new account has zero ratings
   * and must show "no ratings yet" — never a flattering default of 5 stars.
   */
  function getUserReliability(userId) {
    const user = (marbsDB.data.users || []).find(u => u.user_id === userId);
    const ratings = (marbsDB.data.ratings || []).filter(r => r.target_user_id === userId);

    // Fall back to the denormalised counters only when they are genuinely set.
    let count = ratings.length;
    let avg = null;
    if (count === 0 && user && Number(user.rating_count) > 0) {
      count = Number(user.rating_count);
      avg = user.rating_avg != null ? Number(user.rating_avg).toFixed(1) : null;
    } else if (count > 0) {
      const sum = ratings.reduce((acc, r) => acc + Number(r.stars || 0), 0);
      avg = (sum / ratings.length).toFixed(1);
    }

    // No ratings at all -> zero state.
    if (avg === null || count === 0) {
      return {
        avg: '0.0',
        count: 0,
        hasRatings: false,
        filledStars: 0,
        starsHtml: '☆☆☆☆☆',
        tier: 'New Citizen',
        avgLabel: '—',
        countLabel: 'No ratings yet',
        shortLabel: 'New Citizen'
      };
    }

    const numericAvg = Number(avg);
    const filled = Math.min(5, Math.max(0, Math.round(numericAvg)));
    return {
      avg: avg,
      count: count,
      hasRatings: true,
      filledStars: filled,
      starsHtml: '★'.repeat(filled),
      tier: numericAvg >= 4.5 ? 'Highly Reliable Citizen' : numericAvg >= 3.5 ? 'Reliable Citizen' : 'Community Member',
      avgLabel: avg,
      countLabel: `Based on ${count} confirmed safe transaction${count === 1 ? '' : 's'}`,
      shortLabel: `${avg} ★ (${count})`
    };
  }
  window.getUserReliability = getUserReliability;

  function switchVerifModalTab(tab, focusPostId = null, claimantId = null) {
    const answersBtn = $('#verifTabAnswersBtn');
    const messagesBtn = $('#verifTabMessagesBtn');
    const answersContent = $('#verifTabContentAnswers');
    const messagesContent = $('#verifTabContentMessages');
    const headerTitle = $('#verifModalHeaderTitle');

    if (tab === 'messages') {
      if (answersBtn) answersBtn.classList.remove('active');
      if (messagesBtn) messagesBtn.classList.add('active');
      if (answersContent) answersContent.style.display = 'none';
      if (messagesContent) messagesContent.style.display = 'block';
      if (headerTitle) headerTitle.textContent = 'Private Messenger';

      renderMessengerThreadsList();
      if (focusPostId) {
        selectMessengerConversation(focusPostId, claimantId);
      } else {
        const firstPost = (marbsDB.data.posts || []).find(p => p.post_id === (activeChatPost ? activeChatPost.post_id : null)) ||
                          (marbsDB.data.posts || [])[0];
        if (firstPost) {
          selectMessengerConversation(firstPost.post_id, claimantId);
        }
      }
      startMessengerRealTimeSync();
    } else {
      if (messagesBtn) messagesBtn.classList.remove('active');
      if (answersBtn) answersBtn.classList.add('active');
      if (messagesContent) messagesContent.style.display = 'none';
      if (answersContent) answersContent.style.display = 'block';
      if (headerTitle) headerTitle.textContent = 'Private Verification Answers';
      stopMessengerRealTimeSync();
      renderVerificationAnswersList($('#postVerificationsFilterSelect')?.value || 'ALL');
    }
  }
  window.switchVerifModalTab = switchVerifModalTab;

  function startMessengerRealTimeSync() {
    stopMessengerRealTimeSync();
    messengerPollingTimer = setInterval(() => {
      const modal = $('#postVerificationsModal');
      const messagesTab = $('#verifTabContentMessages');
      if (modal && modal.classList.contains('active') && messagesTab && messagesTab.style.display !== 'none') {
        renderLiveMessengerMessages(false);
      } else {
        stopMessengerRealTimeSync();
      }
    }, 1200);
  }

  function stopMessengerRealTimeSync() {
    if (messengerPollingTimer) {
      clearInterval(messengerPollingTimer);
      messengerPollingTimer = null;
    }
  }
  window.stopMessengerRealTimeSync = stopMessengerRealTimeSync;

  function renderMessengerThreadsList() {
    const container = $('#messengerThreadsList');
    if (!container) return;

    const user = marbsDB.getCurrentUser();
    if (!user) return;

    const userPosts = (marbsDB.data.posts || []).filter(p =>
      p.user_id === user.user_id || p.poster_id === user.user_id || user.role === 'ADMIN'
    );
    const userMatches = (marbsDB.data.matches || []).filter(m =>
      user.role === 'ADMIN' || m.claimant_id === user.user_id || userPosts.some(p => p.post_id === m.lost_post_id || p.post_id === m.found_post_id)
    );

    const threads = [];
    const seenPostIds = new Set();

    userMatches.forEach(m => {
      const pid = m.lost_post_id || m.found_post_id;
      if (!seenPostIds.has(pid)) {
        seenPostIds.add(pid);
        const p = (marbsDB.data.posts || []).find(post => post.post_id === pid);
        if (p) threads.push({ post: p, match: m, claimantId: m.claimant_id });
      }
    });

    userPosts.forEach(p => {
      if (!seenPostIds.has(p.post_id)) {
        seenPostIds.add(p.post_id);
        threads.push({ post: p, match: null, claimantId: 'USR-102' });
      }
    });

    const badge = $('#verifMessagesTabCount');
    if (badge) badge.textContent = threads.length;

    if (threads.length === 0) {
      container.innerHTML = `<div style="padding: 20px; font-size: 12px; color: var(--text-muted); text-align: center;">No active conversations yet.</div>`;
      return;
    }

    container.innerHTML = threads.map(t => {
      const p = t.post;
      const isSelected = activeChatPost && activeChatPost.post_id === p.post_id;
      const claimant = (marbsDB.data.users || []).find(u => u.user_id === t.claimantId) || {
        first_name: 'Verified Citizen',
        public_alias: 'Citizen #vOIUJk'
      };

      const lastMsg = [...(marbsDB.data.messages || [])].reverse().find(m => m.post_id === p.post_id);
      const snippet = lastMsg ? lastMsg.message : 'Tap to start conversation...';

      return `
        <div class="messenger-thread-item ${isSelected ? 'active' : ''}" onclick="window.selectMessengerConversation('${p.post_id}', '${t.claimantId}')">
          <div class="messenger-thread-avatar">
            <img src="${p.image || 'assets/images.jpg'}" alt="Item" onerror="this.src='assets/images.jpg'">
            <span class="messenger-online-dot" title="Active Now"></span>
          </div>
          <div class="messenger-thread-content">
            <div class="messenger-thread-name">${escapeHtml(claimant.public_alias || claimant.first_name)}</div>
            <div class="messenger-thread-item-title">${escapeHtml(p.item_name)}</div>
            <div class="messenger-thread-snippet">${escapeHtml(snippet)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function selectMessengerConversation(postId, counterpartyId = null) {
    const post = (marbsDB.data.posts || []).find(p => p.post_id === postId) || (marbsDB.data.posts || [])[0];
    if (!post) return;

    activeChatPost = post;
    activeChatCounterpartyId = counterpartyId || 'USR-102';

    $$('.messenger-thread-item').forEach(item => item.classList.remove('active'));

    // Populate Facebook Marketplace Item Banner at Top of Chat
    const bannerImg = $('#marketplaceItemImg');
    const bannerType = $('#marketplaceItemType');
    const bannerTitle = $('#marketplaceItemTitle');
    const bannerStatus = $('#marketplaceItemStatusBadge');
    const bannerLocation = $('#marketplaceItemLocation');
    const bannerCounterparty = $('#marketplaceItemCounterparty');

    if (bannerImg) bannerImg.src = post.image || 'assets/images.jpg';
    if (bannerType) {
      bannerType.textContent = post.post_type || 'POST';
      bannerType.className = `post-badge ${post.post_type === 'LOST' ? 'badge-lost' : 'badge-found'}`;
    }
    if (bannerTitle) bannerTitle.textContent = post.item_name || 'Item';
    if (bannerStatus) {
      bannerStatus.textContent = post.status === 'RESOLVED' ? '✓ RETRIEVED / RESOLVED' : (post.status || 'MATCH CONFIRMED');
    }
    if (bannerLocation) bannerLocation.textContent = post.general_location || 'Koronadal City';

    const counterparty = (marbsDB.data.users || []).find(u => u.user_id === activeChatCounterpartyId) || {
      first_name: 'Verified Citizen',
      public_alias: 'Citizen #vOIUJk'
    };
    const reliability = getUserReliability(activeChatCounterpartyId);

    if (bannerCounterparty) {
      const ratingBadge = reliability.hasRatings
        ? `<span style="color: #f59e0b; font-size: 11px; margin-left: 4px; font-weight: 800;" title="${reliability.countLabel}">★ ${reliability.avg}</span>`
        : `<span style="color: var(--text-muted); font-size: 11px; margin-left: 4px; font-weight: 700;" title="${reliability.countLabel}">New citizen</span>`;
      bannerCounterparty.innerHTML = `With: <strong>${escapeHtml(counterparty.public_alias || counterparty.first_name)}</strong>${ratingBadge}`;
    }

    renderLiveMessengerMessages(true);
  }
  window.selectMessengerConversation = selectMessengerConversation;

  function renderLiveMessengerMessages(scrollBottom = true) {
    const container = $('#messengerMessagesContainer');
    if (!container || !activeChatPost) return;

    const user = marbsDB.getCurrentUser();
    const pid = activeChatPost.post_id;
    const postMessages = (marbsDB.data.messages || []).filter(m => m.post_id === pid);

    if (postMessages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">💬</div>
          <strong style="color: var(--text-main); font-size: 14px;">Direct Real-Time Chat Started</strong>
          <p style="font-size: 12px; margin-top: 4px;">Send a message below or use quick replies to coordinate return at Koronadal City Hall or approved Safe Pickup Place.</p>
        </div>
      `;
      return;
    }

    const isAtBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 60;

    container.innerHTML = postMessages.map(msg => {
      const isMine = user && msg.sender_id === user.user_id;
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="messenger-bubble ${isMine ? 'mine' : 'other'}">
          <div>${escapeHtml(msg.message)}</div>
          <div class="messenger-bubble-time">${timeStr} ${isMine ? '✓ Delivered' : ''}</div>
        </div>
      `;
    }).join('');

    if (scrollBottom || isAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function handleSendMessengerMessage() {
    const input = $('#messengerInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const user = marbsDB.getCurrentUser();
    if (!user) {
      openLoginModal();
      return;
    }

    // Anti-scam filter per Section 28
    const scamPhrases = [
      'send money first',
      'send payment first',
      'transfer gcash first',
      'pay me first',
      'send load first',
      'deposit first'
    ];
    if (scamPhrases.some(p => text.toLowerCase().includes(p))) {
      alert('⚠️ SECURITY WARNING (MARBSLF SCAM PREVENTOR):\nYour message was blocked because it requests money before return verification.\n"Do not send payment before a legitimate match and verified return process."');
      marbsDB.logAudit('SECURITY_ALERT', `Suspicious money demand flagged from user ${user.user_id}: "${text}"`);
      return;
    }

    const newMsg = {
      message_id: 'MSG-' + Date.now().toString().slice(-4),
      sender_id: user.user_id,
      receiver_id: activeChatCounterpartyId || 'USR-102',
      post_id: activeChatPost ? activeChatPost.post_id : 'POST-002',
      message: text,
      timestamp: new Date().toISOString(),
      status: 'SENT'
    };

    marbsDB.data.messages.push(newMsg);
    marbsDB.save();
    input.value = '';

    renderLiveMessengerMessages(true);
    renderMessengerThreadsList();

    // Realistic Real-Time Simulated Reply after 1.5 seconds for interactive experience
    const currentPostId = activeChatPost.post_id;
    const counterpartyId = activeChatCounterpartyId;
    setTimeout(() => {
      if (activeChatPost && activeChatPost.post_id === currentPostId) {
        const autoReplies = [
          "Thank you for reaching out! Yes, the item is safe with me. I agree to meet at the official Safe Pickup Place.",
          "Received your message! I'm ready to schedule our return handover at Koronadal City Hall.",
          "Noted! Let's confirm the safe meetup schedule through the Safe Meetup scheduler."
        ];
        const randomReply = autoReplies[Math.floor(Math.random() * autoReplies.length)];
        const replyMsg = {
          message_id: 'MSG-' + Date.now().toString().slice(-4),
          sender_id: counterpartyId,
          receiver_id: user.user_id,
          post_id: currentPostId,
          message: randomReply,
          timestamp: new Date().toISOString(),
          status: 'SENT'
        };
        marbsDB.data.messages.push(replyMsg);
        marbsDB.save();
        renderLiveMessengerMessages(true);
        renderMessengerThreadsList();
      }
    }, 1500);
  }

  window.sendQuickMessengerText = function(text) {
    const input = $('#messengerInput');
    if (input) {
      input.value = text;
      handleSendMessengerMessage();
    }
  };

  window.triggerScheduleFromChat = function() {
    if (activeChatPost) {
      window._activeSchedulingPostId = activeChatPost.post_id;
      window._activeSchedulingClaimantId = activeChatCounterpartyId || 'USR-102';
    }
    $('#postVerificationsModal').classList.remove('active');
    stopMessengerRealTimeSync();
    $('#chatModal').classList.remove('active');
    $('#meetupModal').classList.add('active');
  };

  window.openMessengerForPost = function(postId, claimantId = null) {
    const modal = $('#postVerificationsModal');
    if (!modal) return;
    modal.classList.add('active');
    switchVerifModalTab('messages', postId, claimantId);
  };

  function setupMessaging() {
    $('#chatModalClose').addEventListener('click', () => {
      $('#chatModal').classList.remove('active');
    });

    const messengerSendBtn = $('#messengerSendBtn');
    const messengerInput = $('#messengerInput');
    if (messengerSendBtn && messengerInput) {
      messengerSendBtn.addEventListener('click', handleSendMessengerMessage);
      messengerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSendMessengerMessage();
      });
    }

    const legacySendBtn = $('#chatSendBtn');
    const legacyInput = $('#chatInput');
    if (legacySendBtn && legacyInput) {
      legacySendBtn.addEventListener('click', () => {
        const text = legacyInput.value.trim();
        if (!text) return;
        const user = marbsDB.getCurrentUser();
        const msg = {
          message_id: 'MSG-' + Date.now().toString().slice(-4),
          sender_id: user.user_id,
          receiver_id: 'USR-102',
          post_id: activeChatPost ? activeChatPost.post_id : 'POST-002',
          message: text,
          timestamp: new Date().toISOString(),
          status: 'SENT'
        };
        marbsDB.data.messages.push(msg);
        marbsDB.save();
        legacyInput.value = '';
        renderChatMessages();
      });
      legacyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') legacySendBtn.click();
      });
    }
  }

  function openChatModal(postId) {
    // Open the new Real-Time Messenger in Verification modal
    window.openMessengerForPost(postId);
  }

  function renderChatMessages() {
    const container = $('#chatMessagesContainer');
    if (!container) return;
    const user = marbsDB.getCurrentUser();
    const messages = marbsDB.data.messages;
    container.innerHTML = messages.map(msg => {
      const isMine = msg.sender_id === user.user_id;
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="chat-bubble ${isMine ? 'mine' : 'other'}">
          <div>${escapeHtml(msg.message)}</div>
          <div class="chat-bubble-time">${timeStr}</div>
        </div>
      `;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  // 16. Marbs Points Wallet & Redemption (Section 19, 21, 22)
  function setupPointsWallet() {
    $('#pointsModalClose').addEventListener('click', () => {
      $('#pointsModal').classList.remove('active');
    });

    $('#openWalletBtn').addEventListener('click', openWalletModal);
  }

  function openWalletModal() {
    const user = marbsDB.getCurrentUser();
    const modal = $('#pointsModal');

    $('#walletPointsAvailable').textContent = user.points_balance || 0;
    const levelInfo = MarbsLFDatabase.getMarbsPointLevel(user.points_balance);
    $('#walletUserLevel').textContent = `${levelInfo.badge} ${levelInfo.level}`;

    // Render Vouchers Catalog (Section 22)
    const vouchersGrid = $('#vouchersGrid');
    if (vouchersGrid) {
      vouchersGrid.innerHTML = marbsDB.data.vouchers.map(v => {
        const canAfford = user.points_balance >= v.points_required;
        return `
          <div style="background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="font-size: 11px; font-weight: 700; color: var(--primary-dark); text-transform: uppercase;">${v.category}</div>
              <h4 style="font-size: 14px; font-weight: 700; margin: 4px 0;">${v.title}</h4>
              <p style="font-size: 11px; color: var(--text-muted);">${v.description}</p>
              <div style="font-size: 11px; color: var(--text-subtle); margin-top: 4px;">Partner: ${v.partner}</div>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border);">
              <span style="font-weight: 800; font-size: 13px; color: var(--text-main);">${v.points_required} MP</span>
              <button class="btn btn-primary" style="padding: 4px 12px; font-size: 11px;" ${!canAfford ? 'disabled style="opacity: 0.5;"' : ''} onclick="window.redeemVoucher('${v.voucher_id}')">
                ${canAfford ? 'Redeem' : 'Need MP'}
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // Render Points History Table (Section 21)
    const historyTbody = $('#pointsHistoryTbody');
    if (historyTbody) {
      const userTxs = marbsDB.data.points_transactions.filter(t => t.user_id === user.user_id);
      if (userTxs.length === 0) {
        historyTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No points transactions yet</td></tr>`;
      } else {
        historyTbody.innerHTML = userTxs.map(tx => `
          <tr>
            <td><strong>${tx.transaction_id}</strong></td>
            <td>${escapeHtml(tx.reason)}</td>
            <td style="color: ${tx.amount > 0 ? '#10b981' : '#ef4444'}; font-weight: 700;">+${tx.amount} MP</td>
            <td><span class="activity-badge" style="background: #d1fae5; color: #065f46;">${tx.status}</span></td>
          </tr>
        `).join('');
      }
    }

    modal.classList.add('active');
  }

  window.redeemVoucher = function (voucherId) {
    const user = marbsDB.getCurrentUser();
    const voucher = marbsDB.data.vouchers.find(v => v.voucher_id === voucherId);
    if (!voucher || user.points_balance < voucher.points_required) {
      showToast('❌ Insufficient Marbs Points balance');
      return;
    }

    user.points_balance -= voucher.points_required;
    const redemptionCode = 'MLF-VOUCH-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    marbsDB.data.points_transactions.unshift({
      transaction_id: 'TX-' + Date.now().toString().slice(-4),
      user_id: user.user_id,
      amount: -voucher.points_required,
      transaction_type: 'REDEEMED',
      reason: `Redeemed ${voucher.title} (Code: ${redemptionCode})`,
      related_post_id: 'N/A',
      date: new Date().toISOString(),
      status: 'REDEEMED'
    });

    marbsDB.save();
    openWalletModal();
    renderUserPill();

    alert(`🎉 Voucher Redeemed Successfully!\n\nPartner Voucher: ${voucher.title}\nVoucher Code: ${redemptionCode}\n\nPresent this code at participating stores in Koronadal City.`);
  };

  // 17. Scam & Abuse Reporting Modal (Section 31)
  function setupScamReporting() {
    $('#reportModalClose').addEventListener('click', () => {
      $('#scamReportModal').classList.remove('active');
    });

    const form = $('#scamReportForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = marbsDB.getCurrentUser();
        const reason = $('#reportReasonSelect').value;
        const details = $('#reportDetailsInput').value.trim();

        const report = {
          report_id: 'REP-' + Date.now().toString().slice(-4),
          reporter_id: user.user_id,
          reported_user_id: 'SUSPECT',
          reported_post_id: activePostForModal ? activePostForModal.post_id : 'GENERAL',
          reason: reason,
          details: details,
          status: 'UNDER_REVIEW',
          admin_action: 'Pending administrator inspection',
          created_at: new Date().toISOString()
        };

        marbsDB.data.reports.unshift(report);
        marbsDB.logAudit('SCAM_REPORT_FILED', `Report ${report.report_id} filed by ${user.user_id} regarding reason: ${reason}`);
        marbsDB.save();

        $('#scamReportModal').classList.remove('active');
        form.reset();
        showToast('✓ Report submitted! Koronadal City moderators will investigate promptly.');
      });
    }
  }

  function openScamReportModal(type, targetId) {
    $('#scamReportModal').classList.add('active');
  }

  // 18. Identity Verification Submission (Section 4)
  function setupVerificationModal() {
    $('#idModalClose').addEventListener('click', () => {
      $('#idVerificationModal').classList.remove('active');
    });

    const form = $('#idVerificationForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = marbsDB.getCurrentUser();
        const idType = $('#idTypeSelect').value;
        const legalName = $('#idLegalName').value.trim();

        const verification = {
          verification_id: 'VER-' + Date.now().toString().slice(-4),
          user_id: user.user_id,
          full_legal_name: legalName || `${user.first_name} ${user.last_name}`,
          id_type: idType,
          id_image: capturedPhotoPayload ? capturedPhotoPayload.image_data : 'assets/id_sample.jpg',
          camera_verified: !!capturedPhotoPayload,
          status: 'PENDING',
          submitted_at: new Date().toISOString(),
          reviewed_by: '',
          reviewed_at: ''
        };

        user.verification_status = 'PENDING';
        marbsDB.data.id_verifications.unshift(verification);
        marbsDB.logAudit('ID_VERIFICATION_SUBMITTED', `User ${user.user_id} submitted ${idType} for review`);
        marbsDB.save();

        $('#idVerificationModal').classList.remove('active');
        form.reset();
        capturedPhotoPayload = null;
        renderUserDashboard();
        renderUserPill();

        showToast('✓ ID verification submitted! Administrator review is pending.');
      });
    }
  }

  // 19. User Registration & Login (Section 3 & 5)
  function setupAuthModals() {
    $('#loginModalClose').addEventListener('click', () => $('#loginModal').classList.remove('active'));
    $('#registerModalClose').addEventListener('click', () => $('#registerModal').classList.remove('active'));

    $('#openLoginModalBtn').addEventListener('click', openLoginModal);
    $('#openRegisterModalBtn').addEventListener('click', openRegisterModal);
    $('#switchToRegisterBtn').addEventListener('click', () => {
      $('#loginModal').classList.remove('active');
      openRegisterModal();
    });
    $('#switchToLoginBtn').addEventListener('click', () => {
      $('#registerModal').classList.remove('active');
      openLoginModal();
    });

    // Password visibility togglers
    $$('.password-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        const eyeOpen = btn.querySelector('.eye-open');
        const eyeClosed = btn.querySelector('.eye-closed');

        if (input.type === 'password') {
          input.type = 'text';
          if (eyeOpen) eyeOpen.style.display = 'none';
          if (eyeClosed) eyeClosed.style.display = 'block';
        } else {
          input.type = 'password';
          if (eyeOpen) eyeOpen.style.display = 'block';
          if (eyeClosed) eyeClosed.style.display = 'none';
        }
      });
    });

    const loginForm = $('#loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const loginVal = $('#loginIdentifier').value.trim();
        const passVal = $('#loginPassword').value.trim();
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const origText = submitBtn.textContent;
        submitBtn.textContent = 'Signing in...';
        submitBtn.disabled = true;

        try {
          if (window.signInWithEmailOrUsername) {
            const res = await window.signInWithEmailOrUsername(loginVal, passVal);
            if (res && res.user) {
              const u = res.profile || {
                user_id: res.user.id,
                first_name: (res.user.user_metadata?.first_name || loginVal.split('@')[0]),
                middle_name: '',
                last_name: (res.user.user_metadata?.last_name || ''),
                public_alias: 'Verified Citizen #' + res.user.id.slice(0, 6),
                email: res.user.email,
                username: loginVal,
                account_status: 'ACTIVE',
                verification_status: 'VERIFIED',
                points_balance: 100,
                role: 'USER'
              };

              const existingIdx = marbsDB.data.users.findIndex(usr => usr.user_id === u.user_id || usr.email === u.email);
              if (existingIdx >= 0) {
                marbsDB.data.users[existingIdx] = u;
              } else {
                marbsDB.data.users.push(u);
              }
              marbsDB.setCurrentUser(u.user_id);
              marbsDB.save();
            }
          } else {
            // Local fallback
            const user = marbsDB.data.users.find(u => u.username.toLowerCase() === loginVal.toLowerCase() || u.email.toLowerCase() === loginVal.toLowerCase()) || marbsDB.data.users[1];
            marbsDB.setCurrentUser(user.user_id);
          }

          $('#loginModal').classList.remove('active');
          renderUserPill();
          const currentUser = marbsDB.getCurrentUser();
          if (currentUser && currentUser.role === 'ADMIN') {
            navigateToView('admin');
          } else {
            navigateToView('home');
          }
          showToast(`✓ Welcome back, ${currentUser.first_name}!`);
        } catch (err) {
          alert('Login Failed: ' + (err.message || 'Please check your email and password.'));
        } finally {
          submitBtn.textContent = origText;
          submitBtn.disabled = false;
        }
      });
    }

    const regForm = $('#registrationForm');
    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstName = $('#regFirstName').value.trim();
        const middleName = $('#regMiddleName') ? $('#regMiddleName').value.trim() : '';
        const lastName = $('#regLastName').value.trim();
        const dob = $('#regDob').value;
        const phone = $('#regPhone').value.trim();
        const email = $('#regEmail').value.trim();
        const username = $('#regUsername').value.trim();
        const barangay = $('#regBarangay').value;
        const password = $('#regPassword') ? $('#regPassword').value : 'password123';
        const confirmPassword = $('#regConfirmPassword') ? $('#regConfirmPassword').value : 'password123';

        if (password !== confirmPassword) {
          alert('Passwords do not match. Please verify your password confirmation.');
          return;
        }

        const submitBtn = regForm.querySelector('button[type="submit"]');
        const origText = submitBtn.textContent;
        submitBtn.textContent = 'Creating account...';
        submitBtn.disabled = true;

        try {
          if (window.signUpWithEmailPassword) {
            const res = await window.signUpWithEmailPassword({
              email, password, firstName, middleName, lastName, dob, phone, username, barangay
            });

            if (res && res.user) {
              const u = res.profile || {
                user_id: res.user.id,
                first_name: firstName,
                middle_name: middleName,
                last_name: lastName,
                public_alias: 'Verified Citizen #' + res.user.id.slice(0, 6),
                email: email,
                username: username,
                account_status: 'ACTIVE',
                verification_status: 'UNVERIFIED',
                points_balance: 50,
                role: 'USER'
              };

              marbsDB.data.users.push(u);
              marbsDB.setCurrentUser(u.user_id);
              marbsDB.save();
            }
          } else {
            const newUserId = 'USR-' + (100 + marbsDB.data.users.length + 1);
            const newUser = {
              user_id: newUserId,
              first_name: firstName,
              middle_name: middleName,
              last_name: lastName,
              public_alias: `Verified Citizen #${newUserId.split('-')[1]}`,
              date_of_birth: dob,
              email: email,
              phone: phone,
              username: username,
              password: password,
              role: 'USER',
              province: 'South Cotabato',
              city: 'Koronadal City',
              barangay: barangay,
              account_status: 'ACTIVE',
              verification_status: 'UNVERIFIED',
              points_balance: 50,
              created_at: new Date().toISOString()
            };
            marbsDB.data.users.push(newUser);
            marbsDB.setCurrentUser(newUserId);
            marbsDB.save();
          }

          $('#registerModal').classList.remove('active');
          regForm.reset();
          // Give the new citizen demo reports so the feed is not empty for them.
          if (typeof marbsDB.seedDemoPosts === 'function') marbsDB.seedDemoPosts();
          renderUserPill();
          renderFeed();

          showNotificationModal({
            title: '🎉 Account Created Successfully!',
            message: `Welcome to MarbsLF, ${firstName}! Your account has been registered with Supabase. Please complete your ID verification to earn your verified badge.`,
            btnText: 'Verify Identity Now',
            onAction: () => $('#idVerificationModal').classList.add('active')
          });
        } catch (err) {
          alert('Registration Error: ' + (err.message || 'Please check your inputs and try again.'));
        } finally {
          submitBtn.textContent = origText;
          submitBtn.disabled = false;
        }
      });
    }
  }

  function openLoginModal() {
    const loginModal = $('#loginModal');
    if (loginModal) {
      loginModal.classList.add('active');
      const passInput = $('#loginPassword');
      if (passInput) passInput.type = 'password';
      const eyeOpen = loginModal.querySelector('.password-toggle-btn .eye-open');
      const eyeClosed = loginModal.querySelector('.password-toggle-btn .eye-closed');
      if (eyeOpen) eyeOpen.style.display = 'block';
      if (eyeClosed) eyeClosed.style.display = 'none';
    }
  }

  function openRegisterModal() {
    $('#registerModal').classList.add('active');
  }

  // 19b. Landing Page Navigation & Auth Controls
  function scrollToLandingPage(pageNum, authTab = null) {
    const user = marbsDB.getCurrentUser();
    if (user) {
      // Signed-in citizens are redirected into the app, never the landing page.
      if (pageNum === 1) navigateToView('home');
      return;
    }

    if (currentView !== 'landing') {
      navigateToView('landing');
    }

    let targetEl = null;
    if (pageNum === 1) targetEl = $('#lpPage1');
    else if (pageNum === 2) targetEl = $('#lpPage2');
    else if (pageNum === 3) targetEl = $('#lpPage3');

    if (authTab) {
      switchLandingAuthTab(authTab);
    }

    if (typeof setLandingNavActive === 'function') {
      setLandingNavActive(pageNum, authTab || (pageNum === 3 ? 'login' : null));
    }

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  window.scrollToLandingPage = scrollToLandingPage;

  function switchLandingAuthTab(tab) {
    const loginTabBtn = $('#lpTabLoginBtn');
    const regTabBtn = $('#lpTabRegisterBtn');
    const loginPanel = $('#lpLoginPanel');
    const regPanel = $('#lpRegisterPanel');

    if (tab === 'register') {
      if (loginTabBtn) loginTabBtn.classList.remove('active');
      if (regTabBtn) regTabBtn.classList.add('active');
      if (loginPanel) loginPanel.style.display = 'none';
      if (regPanel) regPanel.style.display = 'block';
      if (typeof setLandingNavActive === 'function') setLandingNavActive(3, 'register');
    } else {
      if (regTabBtn) regTabBtn.classList.remove('active');
      if (loginTabBtn) loginTabBtn.classList.add('active');
      if (regPanel) regPanel.style.display = 'none';
      if (loginPanel) loginPanel.style.display = 'block';
      if (typeof setLandingNavActive === 'function') setLandingNavActive(3, 'login');
    }
  }
  window.switchLandingAuthTab = switchLandingAuthTab;

  function setupLandingScrollSpy() {
    window.addEventListener('scroll', () => {
      const landingView = $('#landingPageView');
      if (!landingView || landingView.style.display === 'none') return;

      const p1 = $('#lpPage1');
      const p2 = $('#lpPage2');
      const p3 = $('#lpPage3');
      if (!p1 || !p2 || !p3) return;

      const scrollPos = window.scrollY + 200;
      const p3Top = p3.offsetTop;
      const p2Top = p2.offsetTop;

      if (scrollPos >= p3Top) {
        const isReg = $('#lpRegisterPanel') && $('#lpRegisterPanel').style.display !== 'none';
        if (typeof setLandingNavActive === 'function') setLandingNavActive(3, isReg ? 'register' : 'login');
      } else if (scrollPos >= p2Top) {
        if (typeof setLandingNavActive === 'function') setLandingNavActive(2);
      } else {
        if (typeof setLandingNavActive === 'function') setLandingNavActive(1);
      }
    }, { passive: true });
  }

  // Wire Landing Page Login & Signup Form Submissions
  function setupLandingPageForms() {
    setupLandingScrollSpy();
    const lpLoginForm = $('#lpLoginForm');
    if (lpLoginForm) {
      lpLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const loginVal = $('#lpLoginIdentifier').value.trim();
        const passVal = $('#lpLoginPassword').value.trim();
        const submitBtn = lpLoginForm.querySelector('button[type="submit"]');
        const origText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span>Signing in...</span>';
        submitBtn.disabled = true;

        try {
          if (window.signInWithEmailOrUsername) {
            const res = await window.signInWithEmailOrUsername(loginVal, passVal);
            if (res && res.user) {
              const u = res.profile || {
                user_id: res.user.id,
                first_name: (res.user.user_metadata?.first_name || loginVal.split('@')[0]),
                middle_name: '',
                last_name: (res.user.user_metadata?.last_name || ''),
                public_alias: 'Verified Citizen #' + res.user.id.slice(0, 6),
                email: res.user.email,
                username: loginVal,
                account_status: 'ACTIVE',
                verification_status: 'VERIFIED',
                points_balance: 100,
                role: 'USER'
              };
              const existingIdx = marbsDB.data.users.findIndex(usr => usr.user_id === u.user_id || usr.email === u.email);
              if (existingIdx >= 0) {
                marbsDB.data.users[existingIdx] = u;
              } else {
                marbsDB.data.users.push(u);
              }
              marbsDB.setCurrentUser(u.user_id);
              marbsDB.save();
            }
          } else {
            const user = marbsDB.data.users.find(u => u.username.toLowerCase() === loginVal.toLowerCase() || u.email.toLowerCase() === loginVal.toLowerCase()) || marbsDB.data.users[0];
            marbsDB.setCurrentUser(user.user_id);
          }

          renderUserPill();
          const currentUser = marbsDB.getCurrentUser();
          if (currentUser && currentUser.role === 'ADMIN') {
            navigateToView('admin');
          } else {
            navigateToView('home');
          }
          showToast(`✓ Welcome to MarbsLF, ${currentUser.first_name}!`);
        } catch (err) {
          alert('Login Failed: ' + (err.message || 'Please check your email and password.'));
        } finally {
          submitBtn.innerHTML = origText;
          submitBtn.disabled = false;
        }
      });
    }

    const lpRegForm = $('#lpRegisterForm');
    if (lpRegForm) {
      lpRegForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstName = $('#lpRegFirstName').value.trim();
        const lastName = $('#lpRegLastName').value.trim();
        const dob = $('#lpRegDob').value;
        const phone = $('#lpRegPhone').value.trim();
        const email = $('#lpRegEmail').value.trim();
        const username = $('#lpRegUsername').value.trim();
        const barangay = $('#lpRegBarangay').value;
        const password = $('#lpRegPassword').value;
        const confirmPassword = $('#lpRegConfirmPassword').value;

        if (password !== confirmPassword) {
          alert('Passwords do not match. Please verify your password confirmation.');
          return;
        }

        const submitBtn = lpRegForm.querySelector('button[type="submit"]');
        const origText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span>Creating account...</span>';
        submitBtn.disabled = true;

        try {
          if (window.signUpWithEmailPassword) {
            const res = await window.signUpWithEmailPassword({
              email, password, firstName, middleName: '', lastName, dob, phone, username, barangay
            });
            if (res && res.user) {
              const u = res.profile || {
                user_id: res.user.id,
                first_name: firstName,
                middle_name: '',
                last_name: lastName,
                public_alias: 'Verified Citizen #' + res.user.id.slice(0, 6),
                email: email,
                username: username,
                account_status: 'ACTIVE',
                verification_status: 'UNVERIFIED',
                points_balance: 50,
                role: 'USER'
              };
              marbsDB.data.users.push(u);
              marbsDB.setCurrentUser(u.user_id);
              marbsDB.save();
            }
          } else {
            const newUserId = 'USR-' + (100 + marbsDB.data.users.length + 1);
            const newUser = {
              user_id: newUserId,
              first_name: firstName,
              middle_name: '',
              last_name: lastName,
              public_alias: `Verified Citizen #${newUserId.split('-')[1]}`,
              date_of_birth: dob,
              email: email,
              phone: phone,
              username: username,
              password: password,
              role: 'USER',
              province: 'South Cotabato',
              city: 'Koronadal City',
              barangay: barangay,
              account_status: 'ACTIVE',
              verification_status: 'UNVERIFIED',
              points_balance: 50,
              created_at: new Date().toISOString()
            };
            marbsDB.data.users.push(newUser);
            marbsDB.setCurrentUser(newUserId);
            marbsDB.save();
          }

          lpRegForm.reset();
          // Give the new citizen demo reports so the feed is not empty for them.
          if (typeof marbsDB.seedDemoPosts === 'function') marbsDB.seedDemoPosts();
          renderUserPill();
          navigateToView('home');

          showNotificationModal({
            title: '🎉 Account Created Successfully!',
            message: `Welcome to MarbsLF, ${firstName}! Your account has been registered. Please complete your ID verification to earn your verified badge.`,
            btnText: 'Verify Identity Now',
            onAction: () => $('#idVerificationModal').classList.add('active')
          });
        } catch (err) {
          alert('Registration Error: ' + (err.message || 'Please check your inputs and try again.'));
        } finally {
          submitBtn.innerHTML = origText;
          submitBtn.disabled = false;
        }
      });
    }
  }

  // 20. User Dashboard & Menu Tabs (Section 6)
  function renderUserDashboard() {
    const user = marbsDB.getCurrentUser();
    if (!user) {
      $('#dashboardView').style.display = 'none';
      $('#homeView').style.display = 'block';
      openLoginModal();
      return;
    }
    // Check if there is an approved verification record in DB for this user
    const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
    const approvedVer = (marbsDB.data.id_verifications || []).find(v => {
      const isUserMatch = v.user_id && v.user_id === user.user_id;
      const isNameMatch = v.full_legal_name && v.full_legal_name.trim().toLowerCase() === userFullName;
      return (isUserMatch || isNameMatch) && v.status === 'VERIFIED';
    });

    if (approvedVer && user.verification_status !== 'VERIFIED') {
      user.verification_status = 'VERIFIED';
      marbsDB.save();
    }

    const currentStatus = (user.verification_status || 'UNVERIFIED').toUpperCase();
    const dashAvatar = $('#dashAvatarText');
    if (user.avatar_url) {
      dashAvatar.innerHTML = `<img src="${user.avatar_url}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      dashAvatar.textContent = (user.first_name[0] || 'U').toUpperCase();
    }
    $('#dashUserLegalName').textContent = `${user.first_name || ''} ${user.last_name || ''}`;
    $('#dashUserAlias').textContent = user.public_alias || 'Citizen';
    $('#dashUserStatus').textContent = currentStatus;
    $('#dashUserStatus').className = `dash-user-badge status-${currentStatus.toLowerCase()}`;

    // Reliability Rating in Dashboard Profile Card
    const reliability = getUserReliability(user.user_id);
    const dashStars = $('#dashProfileStars');
    const dashAvg = $('#dashProfileAvg');
    const dashTier = $('#dashProfileTier');
    const dashCount = $('#dashProfileCount');
    const dashBox = $('#dashProfileReliability');
    if (dashStars) {
      dashStars.textContent = reliability.starsHtml;
      dashStars.style.color = reliability.hasRatings ? '#f59e0b' : '#cbd5e1';
    }
    if (dashAvg) dashAvg.textContent = reliability.hasRatings ? `${reliability.avg} / 5.0` : 'Not yet rated';
    if (dashTier) {
      dashTier.textContent = reliability.tier;
      dashTier.style.color = reliability.hasRatings ? '#16a34a' : 'var(--text-muted)';
    }
    if (dashCount) dashCount.textContent = reliability.countLabel;
    // Neutral styling for accounts with no ratings yet
    if (dashBox) {
      dashBox.style.background = reliability.hasRatings ? '#fffbeb' : '#f8fafc';
      dashBox.style.borderColor = reliability.hasRatings ? '#fef08a' : '#e2e8f0';
    }

    // Stats
    const userPosts = marbsDB.data.posts.filter(p => p.user_id === user.user_id);
    $('#dashMyPostsCount').textContent = userPosts.length;
    $('#dashPointsCount').textContent = `${user.points_balance || 0} MP`;

    const userMatches = marbsDB.data.matches.filter(m => m.claimant_id === user.user_id);
    $('#dashMatchesCount').textContent = userMatches.length;

    // Render Posts in Dashboard
    const myPostsTbody = $('#myPostsTbody');
    if (myPostsTbody) {
      if (userPosts.length === 0) {
        myPostsTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">You have not created any posts yet.</td></tr>`;
      } else {
        myPostsTbody.innerHTML = userPosts.map(p => `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${p.image}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover;" onerror="this.src='assets/images.jpg'">
                <strong>${escapeHtml(p.item_name)}</strong>
              </div>
            </td>
            <td><span class="post-badge ${p.post_type === 'LOST' ? 'badge-lost' : 'badge-found'}">${p.post_type}</span></td>
            <td>${p.general_location}</td>
            <td>
              <span class="activity-badge" style="${
                p.status === 'APPROVED' ? 'background: #d1fae5; color: #065f46; font-weight: 700;' :
                p.status === 'REJECTED' ? 'background: #fee2e2; color: #991b1b; font-weight: 700;' :
                'background: #fef3c7; color: #92400e; font-weight: 700;'
              }">
                ${p.status === 'PENDING_REVIEW' ? 'PENDING REVIEW' : p.status}
              </span>
            </td>
            <td>
              <div style="display: flex; gap: 6px; align-items: center;">
                <button class="btn btn-outline" style="padding: 2px 8px; font-size: 11px;" onclick="window.marbsApp.openPostDetailModal('${p.post_id}')">View</button>
                <button class="btn btn-outline" style="padding: 2px 8px; font-size: 11px; color: #2563eb; border-color: #bfdbfe;" onclick="window.openPostVerificationAnswers('${p.post_id}')" title="Review verification answers submitted for this post">Answers</button>
                <button class="btn btn-outline" style="padding: 2px 8px; font-size: 11px; color: #ef4444; border-color: #fca5a5;" onclick="window.marbsApp.deletePost('${p.post_id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('');
      }
    }

    // Render Meetups in Dashboard
    const myMeetupsContainer = $('#myMeetupsContainer');
    if (myMeetupsContainer) {
      const meetups = marbsDB.data.meetups.filter(m => m.owner_id === user.user_id || m.finder_id === user.user_id);
      if (meetups.length === 0) {
        myMeetupsContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">No scheduled meetups at approved Safe Pickup Places.</p>`;
      } else {
        myMeetupsContainer.innerHTML = meetups.map(m => `
          <div class="handshake-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span class="activity-badge" style="background: #dbeafe; color: #1e40af; font-weight: 800;">${m.status}</span>
                <h4 style="font-size: 15px; font-weight: 800; margin-top: 6px; display: flex; align-items: center; gap: 6px;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--primary-dark);"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                  ${escapeHtml(m.place_name)}
                </h4>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Scheduled: ${m.date} at ${m.time}</div>
              </div>
              <button class="btn btn-outline" style="font-size: 11px;" onclick="window.openChat('${m.post_id}')">Open Private Chat</button>
            </div>

            <!-- 2-Way Handshake Buttons per Section 17 -->
            <div class="handshake-steps">
              <div class="handshake-box">
                <div style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">Lost Item Owner Step:</div>
                <button class="btn btn-primary" style="width: 100%; font-size: 12px;" ${m.owner_confirmed_return ? 'disabled style="background: #10b981; color: #fff;"' : ''} onclick="window.confirmReturnStep('${m.meetup_id}', 'OWNER')">
                  ${m.owner_confirmed_return ? '✓ ITEM RECEIVED (CONFIRMED)' : 'ITEM RECEIVED'}
                </button>
              </div>
              <div class="handshake-box">
                <div style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">Finder Step:</div>
                <button class="btn btn-dark" style="width: 100%; font-size: 12px;" ${m.finder_confirmed_return ? 'disabled style="background: #10b981; color: #fff;"' : ''} onclick="window.confirmReturnStep('${m.meetup_id}', 'FINDER')">
                  ${m.finder_confirmed_return ? '✓ ITEM RETURNED (CONFIRMED)' : 'ITEM RETURNED'}
                </button>
              </div>
            </div>
          </div>
        `).join('');
      }
    }
  }

  window.openChat = function (postId) {
    openChatModal(postId);
  };

  // 21. Admin Dashboard & Moderation Portal (Section 10, 15, 21, 26, 31, 32)
  function setupAdminPortal() {
    $$('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.admintab;
        $$('.admin-tab-content').forEach(c => c.style.display = 'none');
        $(`#adminTab_${tab}`).style.display = 'block';
      });
    });

    // Add Safe Pickup Place
    const safePlaceForm = $('#adminAddSafePlaceForm');
    if (safePlaceForm) {
      safePlaceForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#adminSafePlaceName').value.trim();
        const address = $('#adminSafePlaceAddress').value.trim();
        const hours = $('#adminSafePlaceHours').value.trim();
        const type = $('#adminSafePlaceType').value;

        const newPlace = {
          place_id: 'SP-' + Date.now().toString().slice(-4),
          name: name,
          address: address,
          latitude: 6.5028,
          longitude: 124.8468,
          operating_hours: hours,
          active_status: 'ACTIVE',
          contact_person: 'Station Desk',
          type: type
        };

        marbsDB.data.safe_places.push(newPlace);
        marbsDB.logAudit('SAFE_PLACE_ADDED', `Admin added safe pickup place: ${name}`);
        marbsDB.save();

        safePlaceForm.reset();
        renderAdminSafePlaces();
        showToast('✓ New Safe Pickup Place added to official Koronadal network.');
      });
    }
  }

  function renderAdminPortal() {
    renderAdminStats();
    renderAdminPosts();
    renderAdminVerifications();
    renderAdminSafePlaces();
    renderAdminReports();
    renderAdminAuditLogs();
  }

  function renderAdminStats() {
    const totalLost = marbsDB.data.posts.filter(p => p.post_type === 'LOST').length;
    const totalFound = marbsDB.data.posts.filter(p => p.post_type === 'FOUND').length;
    const resolvedCount = marbsDB.data.posts.filter(p => p.status === 'RESOLVED').length;
    const petReunions = marbsDB.data.posts.filter(p => p.category === 'Pets' && p.status === 'RESOLVED').length;
    const totalPoints = marbsDB.data.users.reduce((acc, u) => acc + (u.points_balance || 0), 0);

    $('#adminStatLostCount').textContent = totalLost;
    $('#adminStatFoundCount').textContent = totalFound;
    $('#adminStatResolvedCount').textContent = resolvedCount;
    $('#adminStatPetReunions').textContent = petReunions;
    $('#adminStatPointsTotal').textContent = `${totalPoints} MP`;
    $('#adminStatActiveUsers').textContent = marbsDB.data.users.length;
  }

  function renderAdminPosts() {
    const tbody = $('#adminPostsTbody');
    if (!tbody) return;

    tbody.innerHTML = marbsDB.data.posts.map(p => `
      <tr>
        <td><strong>${p.post_id}</strong></td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${p.image}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;" onerror="this.src='assets/images.jpg'">
            <span>${escapeHtml(p.item_name)}</span>
          </div>
        </td>
        <td><span class="post-badge ${p.post_type === 'LOST' ? 'badge-lost' : 'badge-found'}">${p.post_type}</span></td>
        <td>${p.general_location}</td>
        <td>
          <span class="activity-badge" style="${
            p.status === 'APPROVED' ? 'background: #d1fae5; color: #065f46; font-weight: 700;' :
            p.status === 'REJECTED' ? 'background: #fee2e2; color: #991b1b; font-weight: 700;' :
            'background: #fef3c7; color: #92400e; font-weight: 700;'
          }">
            ${p.status === 'PENDING_REVIEW' ? 'PENDING REVIEW' : p.status}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            ${p.status !== 'APPROVED' ? `<button class="btn btn-primary" style="padding: 2px 8px; font-size: 11px;" onclick="window.adminApprovePost('${p.post_id}')">Approve</button>` : ''}
            ${p.status !== 'REJECTED' ? `<button class="btn btn-outline" style="padding: 2px 8px; font-size: 11px; color: #ef4444;" onclick="window.adminRejectPost('${p.post_id}')">Reject</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  window.adminApprovePost = function (postId) {
    const post = marbsDB.data.posts.find(p => p.post_id === postId);
    if (!post) return;

    post.status = 'APPROVED';
    marbsDB.logAudit('POST_APPROVAL', `Approved post ${postId} (${post.item_name})`);

    // If it was a found item, award +10 Marbs Points per Section 14
    if (post.post_type === 'FOUND') {
      const user = marbsDB.data.users.find(u => u.user_id === post.user_id);
      if (user) {
        user.points_balance += 10;
        marbsDB.data.points_transactions.unshift({
          transaction_id: 'TX-' + Date.now().toString().slice(-4),
          user_id: user.user_id,
          amount: 10,
          transaction_type: 'EARNED',
          reason: `Approved Found Item Post (+10 MP) for ${post.item_name}`,
          related_post_id: post.post_id,
          date: new Date().toISOString(),
          status: 'APPROVED'
        });
      }
    }

    marbsDB.save();
    if (window.firestoreDb) {
      window.firestoreDb.collection('posts').doc(postId).set({ status: 'APPROVED' }, { merge: true })
        .catch(err => console.warn('Firestore post approval sync warning:', err));
    }
    renderAdminPortal();
    renderFeed();
    renderRecentActivity();
    renderUserDashboard();
    renderUserPill();
    updateNotificationBadges();
    showToast(`✓ Post ${postId} approved and published publicly!`);
  };

  window.adminRejectPost = function (postId) {
    const post = marbsDB.data.posts.find(p => p.post_id === postId);
    if (!post) return;

    post.status = 'REJECTED';
    marbsDB.logAudit('POST_REJECTION', `Rejected post ${postId}`);
    marbsDB.save();
    if (window.firestoreDb) {
      window.firestoreDb.collection('posts').doc(postId).set({ status: 'REJECTED' }, { merge: true })
        .catch(err => console.warn('Firestore post rejection sync warning:', err));
    }
    renderAdminPortal();
    renderFeed();
    renderRecentActivity();
    renderUserDashboard();
    renderUserPill();
    updateNotificationBadges();
    showToast(`Post ${postId} has been rejected.`);
  };

  let activeAdminVerId = null;

  function renderAdminVerifications() {
    const tbody = $('#adminVerificationsTbody');
    if (!tbody) return;

    if (!marbsDB.data.id_verifications || marbsDB.data.id_verifications.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No ID verification submissions yet.</td></tr>`;
      return;
    }

    const badgeColors = {
      'UNVERIFIED': 'background: #f1f5f9; color: #475569;',
      'PENDING': 'background: #fef3c7; color: #92400e;',
      'VERIFIED': 'background: #d1fae5; color: #065f46;',
      'REJECTED': 'background: #fee2e2; color: #991b1b;',
      'SUSPENDED': 'background: #f3e8ff; color: #6b21a8;'
    };

    tbody.innerHTML = marbsDB.data.id_verifications.map(v => {
      const statusColor = badgeColors[v.status] || 'background: #f1f5f9; color: #475569;';
      const dateStr = v.submitted_at ? new Date(v.submitted_at).toLocaleDateString() : 'N/A';

      return `
        <tr style="cursor: pointer; transition: background 0.15s ease;" onclick="window.openAdminIdDetailsModal('${v.verification_id}')" title="Click to view full ID details and decide verification">
          <td><strong>${v.verification_id}</strong></td>
          <td><code>${v.user_id}</code></td>
          <td><strong style="color: var(--primary-dark);">${escapeHtml(v.full_legal_name)}</strong></td>
          <td>${v.id_type}</td>
          <td>
            <img src="${v.id_image || 'assets/images.jpg'}" alt="ID Photo" style="width: 44px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border);">
          </td>
          <td>${dateStr}</td>
          <td><span class="activity-badge" style="${statusColor}">${v.status}</span></td>
        </tr>
      `;
    }).join('');
  }

  window.openAdminIdDetailsModal = function (verId) {
    const ver = marbsDB.data.id_verifications.find(v => v.verification_id === verId);
    if (!ver) return;

    activeAdminVerId = verId;

    const modal = $('#adminIdDetailsModal');
    if (!modal) return;

    $('#adminDetailIdImage').src = ver.id_image || 'assets/images.jpg';
    $('#adminDetailVerId').textContent = ver.verification_id;
    $('#adminDetailLegalName').textContent = ver.full_legal_name || 'N/A';
    $('#adminDetailDocType').textContent = ver.id_type || 'National ID';
    $('#adminDetailUserId').textContent = ver.user_id || 'N/A';
    $('#adminDetailSubmittedAt').textContent = ver.submitted_at ? new Date(ver.submitted_at).toLocaleString() : 'N/A';
    $('#adminDetailReviewer').textContent = ver.reviewed_by || 'Pending Review';

    const hashBadge = $('#adminDetailHashBadge');
    if (hashBadge) {
      hashBadge.textContent = ver.camera_verified ? `✓ Camera Verification Verified (${ver.verification_id})` : `Uploaded Verification Doc (${ver.verification_id})`;
    }

    const badgeColors = {
      'UNVERIFIED': 'background: #f1f5f9; color: #475569;',
      'PENDING': 'background: #fef3c7; color: #92400e;',
      'VERIFIED': 'background: #d1fae5; color: #065f46;',
      'REJECTED': 'background: #fee2e2; color: #991b1b;',
      'SUSPENDED': 'background: #f3e8ff; color: #6b21a8;'
    };
    const statusColor = badgeColors[ver.status] || 'background: #f1f5f9; color: #475569;';
    $('#adminDetailStatus').innerHTML = `<span class="activity-badge" style="${statusColor}">${ver.status}</span>`;

    modal.classList.add('active');
  };

  // Wire decision buttons inside adminIdDetailsModal
  const acceptBtn = $('#adminDetailAcceptBtn');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (activeAdminVerId) {
        window.adminSetVerificationStatus(activeAdminVerId, 'VERIFIED');
        $('#adminIdDetailsModal').classList.remove('active');
      }
    });
  }

  const rejectBtn = $('#adminDetailRejectBtn');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      if (activeAdminVerId) {
        window.adminSetVerificationStatus(activeAdminVerId, 'REJECTED');
        $('#adminIdDetailsModal').classList.remove('active');
      }
    });
  }

  const suspendBtn = $('#adminDetailSuspendBtn');
  if (suspendBtn) {
    suspendBtn.addEventListener('click', () => {
      if (activeAdminVerId) {
        window.adminSetVerificationStatus(activeAdminVerId, 'SUSPENDED');
        $('#adminIdDetailsModal').classList.remove('active');
      }
    });
  }

  window.adminSetVerificationStatus = function (verId, newStatus) {
    const ver = marbsDB.data.id_verifications.find(v => v.verification_id === verId);
    if (!ver) return;

    ver.status = newStatus;
    ver.reviewed_by = 'USR-ADMIN (Central Admin)';
    ver.reviewed_at = new Date().toISOString();

    // Match target user by user_id OR full legal name / alias
    let targetUser = marbsDB.data.users.find(u => u.user_id === ver.user_id);
    if (!targetUser && ver.full_legal_name) {
      const cleanVerName = ver.full_legal_name.trim().toLowerCase();
      targetUser = marbsDB.data.users.find(u => {
        const uFullName = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
        return uFullName === cleanVerName || (u.public_alias && u.public_alias.toLowerCase() === cleanVerName);
      });
    }

    if (targetUser) {
      targetUser.verification_status = newStatus;
      if (newStatus === 'VERIFIED') {
        targetUser.points_balance = (targetUser.points_balance || 0) + 50; // Verification bonus
      }
    }

    // Also check current active user
    const curUser = marbsDB.getCurrentUser();
    if (curUser) {
      if (curUser.user_id === ver.user_id || 
          (ver.full_legal_name && `${curUser.first_name || ''} ${curUser.last_name || ''}`.trim().toLowerCase() === ver.full_legal_name.trim().toLowerCase())) {
        curUser.verification_status = newStatus;
        if (newStatus === 'VERIFIED' && !targetUser) {
          curUser.points_balance = (curUser.points_balance || 0) + 50;
        }
      }
    }

    // Sync to Firestore if online
    if (window.firestoreDb) {
      try {
        const targetUid = targetUser ? targetUser.user_id : ver.user_id;
        if (targetUid) {
          window.firestoreDb.collection('users').doc(targetUid).set({
            verification_status: newStatus
          }, { merge: true }).catch(err => console.warn('Firestore user update err:', err));
        }
        window.firestoreDb.collection('id_verifications').doc(verId).set(ver, { merge: true })
          .catch(err => console.warn('Firestore ver update err:', err));
      } catch (fErr) {
        console.warn('Firestore sync note:', fErr);
      }
    }

    marbsDB.logAudit(`ID_${newStatus}`, `Admin updated identity verification for user ${ver.user_id || ver.full_legal_name} to ${newStatus}`);
    marbsDB.save();
    renderAdminPortal();
    renderUserDashboard();
    showToast(`✓ Updated verification status to ${newStatus} for ${ver.full_legal_name}`);
  };

  window.adminApproveId = function (verId) { window.adminSetVerificationStatus(verId, 'VERIFIED'); };
  window.adminRejectId = function (verId) { window.adminSetVerificationStatus(verId, 'REJECTED'); };

  function renderAdminSafePlaces() {
    const tbody = $('#adminSafePlacesTbody');
    if (!tbody) return;

    tbody.innerHTML = marbsDB.data.safe_places.map(sp => `
      <tr>
        <td><strong>${sp.place_id}</strong></td>
        <td>${escapeHtml(sp.name)}</td>
        <td>${escapeHtml(sp.address)}</td>
        <td>${escapeHtml(sp.operating_hours)}</td>
        <td><span class="activity-badge" style="background: #d1fae5; color: #065f46;">${sp.active_status}</span></td>
      </tr>
    `).join('');
  }

  function renderAdminReports() {
    const tbody = $('#adminReportsTbody');
    if (!tbody) return;

    tbody.innerHTML = marbsDB.data.reports.map(r => `
      <tr>
        <td><strong>${r.report_id}</strong></td>
        <td>${r.reason}</td>
        <td>${escapeHtml(r.details)}</td>
        <td><span class="activity-badge" style="background: #fee2e2; color: #991b1b;">${r.status}</span></td>
        <td>
          <button class="btn btn-primary" style="padding: 2px 8px; font-size: 11px;" onclick="window.adminResolveReport('${r.report_id}')">Resolve Report</button>
        </td>
      </tr>
    `).join('');
  }

  window.adminResolveReport = function (reportId) {
    const report = marbsDB.data.reports.find(r => r.report_id === reportId);
    if (!report) return;

    report.status = 'RESOLVED';
    report.admin_action = 'Investigated and resolved by moderator';
    marbsDB.logAudit('REPORT_RESOLVED', `Resolved report ${reportId}`);
    marbsDB.save();
    renderAdminPortal();
    showToast(`✓ Report ${reportId} marked as resolved.`);
  };

  function renderAdminAuditLogs() {
    const tbody = $('#adminAuditLogsTbody');
    if (!tbody) return;

    tbody.innerHTML = marbsDB.data.audit_logs.slice(0, 15).map(l => `
      <tr>
        <td><strong>${l.log_id}</strong></td>
        <td><span class="activity-badge" style="background: #e2e8f0; color: #1e293b;">${l.action_type}</span></td>
        <td>${escapeHtml(l.description)}</td>
        <td style="font-size: 11px; color: var(--text-muted);">${new Date(l.timestamp).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  // Helper UI Utilities
  function renderUserPill() {
    const user = marbsDB.getCurrentUser();
    const isAdmin = user && user.role === 'ADMIN';
    const pill = $('#navUserBtn');
    const signOutBtn = $('#navSignOutBtn');
    const loginBtn = $('#openLoginModalBtn');
    const registerBtn = $('#openRegisterModalBtn');

    // 1. Show Admin Portal only on the admin side (hidden for normal users)
    $$('[data-view="admin"]').forEach(el => {
      const parentLi = el.closest('li') || el;
      parentLi.style.display = isAdmin ? '' : 'none';
    });

    // 2. In admin side, remove Verification (visible for normal users)
    $$('[data-view="verifications"]').forEach(el => {
      const parentLi = el.closest('li') || el;
      parentLi.style.display = isAdmin ? 'none' : '';
    });

    // Calculate pending moderation queue count
    const pendingReviewPostsCount = (marbsDB.data.posts || []).filter(p => p.status === 'PENDING_REVIEW').length;
    const adminNavBadge = $('#navAdminQueueBadge');
    if (adminNavBadge) {
      if (pendingReviewPostsCount > 0) {
        adminNavBadge.style.display = 'inline-block';
        adminNavBadge.textContent = pendingReviewPostsCount;
      } else {
        adminNavBadge.style.display = 'none';
      }
    }

    // Calculate pending verification answers count on user's own posts
    const verifNavBadge = $('#navVerificationsBadge');
    if (verifNavBadge) {
      if (user && user.user_id) {
        const userPosts = (marbsDB.data.posts || []).filter(p =>
          (p.user_id && p.user_id === user.user_id) ||
          (p.poster_id && p.poster_id === user.user_id) ||
          (user.user_id === 'USR-ADMIN' && (p.user_id === 'USR-ADMIN' || p.user_id === 'USR-GUEST'))
        );
        const userPostIds = new Set(userPosts.map(p => p.post_id));
        const pendingClaimsCount = (marbsDB.data.matches || []).filter(m =>
          (userPostIds.has(m.lost_post_id) || userPostIds.has(m.found_post_id)) &&
          m.claimant_id !== user.user_id &&
          m.status !== 'RESOLVED' && m.status !== 'MATCH_REJECTED'
        ).length;

        if (pendingClaimsCount > 0) {
          verifNavBadge.style.display = 'inline-block';
          verifNavBadge.textContent = pendingClaimsCount;
        } else {
          verifNavBadge.style.display = 'none';
        }
      } else {
        verifNavBadge.style.display = 'none';
      }
    }

    // Calculate active meetups count for nav badge
    const navMeetupsBadge = $('#navMeetupsBadge');
    if (navMeetupsBadge) {
      if (user && user.user_id) {
        const activeCount = (marbsDB.data.meetups || []).filter(m =>
          (user.role === 'ADMIN' || m.owner_id === user.user_id || m.finder_id === user.user_id) &&
          m.status !== 'COMPLETED' && m.status !== 'CANCELLED'
        ).length;
        if (activeCount > 0) {
          navMeetupsBadge.style.display = 'inline-block';
          navMeetupsBadge.textContent = activeCount;
        } else {
          navMeetupsBadge.style.display = 'none';
        }
      } else {
        navMeetupsBadge.style.display = 'none';
      }
    }

    if (user && user.user_id) {
      if (pill) {
        pill.style.display = 'flex';
        const userRel = getUserReliability(user.user_id);
        pill.innerHTML = `
          <div class="user-avatar-sm" style="position: relative;">
            ${user.avatar_url ? `<img src="${user.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (user.first_name[0] || 'U').toUpperCase()}
            ${(user.role === 'ADMIN' && pendingReviewPostsCount > 0) ? `
              <span style="position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; background: #ef4444; border: 2px solid #fff; border-radius: 50%;"></span>
            ` : ''}
          </div>
          <span class="user-name-sm">
            ${user.role === 'ADMIN' ? 'Admin Portal' : user.first_name}
            ${user.role !== 'ADMIN' ? (userRel.hasRatings
              ? `<span style="color: #f59e0b; font-size: 11px; font-weight: 800; margin-left: 4px;" title="${userRel.countLabel}">★ ${userRel.avg}</span>`
              : `<span style="color: var(--text-muted); font-size: 11px; font-weight: 700; margin-left: 4px;" title="${userRel.countLabel}">New</span>`) : ''}
            ${(user.role === 'ADMIN' && pendingReviewPostsCount > 0) ? `
              <span style="background: #ef4444; color: #fff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px;">${pendingReviewPostsCount}</span>
            ` : ''}
          </span>
        `;
      }
      if (signOutBtn) signOutBtn.style.display = 'inline-flex';
      if (loginBtn) loginBtn.style.display = 'none';
      if (registerBtn) registerBtn.style.display = 'none';

      // A signed-in citizen must never remain on the public landing page.
      // Re-routing here is what fixes "signed up on the landing page but the
      // landing hero still shows underneath the app navbar".
      if (isRouterReady && currentView === 'landing') {
        navigateToView(isAdmin ? 'admin' : 'home');
      }
    } else {
      if (pill) pill.style.display = 'none';
      if (signOutBtn) signOutBtn.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (registerBtn) registerBtn.style.display = 'inline-flex';

      // A guest must never remain on an authenticated-only surface.
      if (isRouterReady && AUTH_GATED_VIEWS.includes(currentView)) {
        navigateToView('landing');
      }
    }
  }

  window.updateAuthUI = renderUserPill;

  function updateNotificationBadges() {
    const count = marbsDB.data.notifications.filter(n => !n.read).length;
    const badge = $('#notifBadge');
    if (badge) {
      if (count > 0) {
        badge.style.display = 'flex';
        badge.textContent = count;
      } else {
        badge.style.display = 'none';
      }
    }

    // Also sync admin queue badge count
    const pendingReviewPostsCount = (marbsDB.data.posts || []).filter(p => p.status === 'PENDING_REVIEW').length;
    const adminNavBadge = $('#navAdminQueueBadge');
    if (adminNavBadge) {
      if (pendingReviewPostsCount > 0) {
        adminNavBadge.style.display = 'inline-block';
        adminNavBadge.textContent = pendingReviewPostsCount;
      } else {
        adminNavBadge.style.display = 'none';
      }
    }

    // Also sync verification answers badge count
    const verifNavBadge = $('#navVerificationsBadge');
    if (verifNavBadge) {
      const user = marbsDB.getCurrentUser();
      if (user && user.user_id) {
        const userPosts = (marbsDB.data.posts || []).filter(p =>
          (p.user_id && p.user_id === user.user_id) ||
          (p.poster_id && p.poster_id === user.user_id) ||
          (user.user_id === 'USR-ADMIN' && (p.user_id === 'USR-ADMIN' || p.user_id === 'USR-GUEST'))
        );
        const userPostIds = new Set(userPosts.map(p => p.post_id));
        const pendingClaimsCount = (marbsDB.data.matches || []).filter(m =>
          (userPostIds.has(m.lost_post_id) || userPostIds.has(m.found_post_id)) &&
          m.claimant_id !== user.user_id &&
          m.status !== 'RESOLVED' && m.status !== 'MATCH_REJECTED'
        ).length;

        if (pendingClaimsCount > 0) {
          verifNavBadge.style.display = 'inline-block';
          verifNavBadge.textContent = pendingClaimsCount;
        } else {
          verifNavBadge.style.display = 'none';
        }
      } else {
        verifNavBadge.style.display = 'none';
      }
    }
  }

  function openNotificationsModal() {
    const list = $('#notifModalList');
    if (list) {
      list.innerHTML = marbsDB.data.notifications.map(n => `
        <div style="padding: 12px; border-radius: var(--radius-sm); background: ${n.read ? 'var(--surface)' : 'var(--primary-light)'}; border: 1px solid var(--border); margin-bottom: 8px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">${escapeHtml(n.title)}</div>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(n.body)}</p>
          <div style="font-size: 10px; color: var(--text-subtle); margin-top: 4px;">${new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      `).join('');
    }

    marbsDB.data.notifications.forEach(n => n.read = true);
    marbsDB.save();
    updateNotificationBadges();

    $('#notificationsModal').classList.add('active');
  }

  function showToast(msg) {
    let toast = document.getElementById('marbsToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'marbsToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #0f172a;
        color: #fff;
        padding: 12px 20px;
        border-radius: var(--radius-full);
        font-size: 13px;
        font-weight: 600;
        box-shadow: var(--shadow-lg);
        z-index: 9999;
        transition: opacity 0.3s ease, transform 0.3s ease;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(246, 184, 25, 0.4);
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 3500);
  }

  function showNotificationModal({ title, message, btnText, onAction }) {
    $('#genericNoticeTitle').textContent = title;
    $('#genericNoticeMessage').textContent = message;
    const actionBtn = $('#genericNoticeActionBtn');
    actionBtn.textContent = btnText || 'Okay';

    const handler = () => {
      $('#genericNoticeModal').classList.remove('active');
      actionBtn.removeEventListener('click', handler);
      if (onAction) onAction();
    };
    actionBtn.addEventListener('click', handler);

    $('#genericNoticeModal').classList.add('active');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose global helpers to window for HTML onclick bindings
  window.$ = $;
  window.$$ = $$;
  window.showToast = showToast;
  window.renderUserPill = renderUserPill;
  window.renderFeed = renderFeed;
  window.setPostsLoading = function(loading) {
    isPostsLoading = !!loading;
    renderFeed();
  };
  window.closeModal = function(modalId) {
    const el = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (el) el.classList.remove('active');
  };
  window.navigateToView = navigateToView;
  window.openWalletModal = openWalletModal;
  window.openScamReportModal = openScamReportModal;
  window.openNotificationsModal = openNotificationsModal;
  window.openLoginModal = openLoginModal;
  window.openRegisterModal = openRegisterModal;
  window.openOwnershipClaimModal = openOwnershipClaimModal;
  window.openChatModal = openChatModal;

  // Reviewer for Private Verification Answers submitted for post owner's items
  function openVerificationsModal(filterPostId = 'ALL') {
    const user = marbsDB.getCurrentUser();
    if (!user) {
      openLoginModal();
      showToast('Please log in to view verification answers.');
      return;
    }

    const modal = $('#postVerificationsModal');
    if (!modal) return;

    // Get user's own posts
    const userPosts = (marbsDB.data.posts || []).filter(p =>
      (p.user_id && p.user_id === user.user_id) ||
      (p.poster_id && p.poster_id === user.user_id) ||
      (user.role === 'ADMIN') ||
      (user.user_id === 'USR-ADMIN' && (p.user_id === 'USR-ADMIN' || p.user_id === 'USR-GUEST'))
    );

    const userPostIds = new Set(userPosts.map(p => p.post_id));

    // Populate post dropdown filter
    const select = $('#postVerificationsFilterSelect');
    if (select) {
      select.innerHTML = `<option value="ALL">All My Posts (${userPosts.length})</option>` +
        userPosts.map(p => `<option value="${p.post_id}" ${p.post_id === filterPostId ? 'selected' : ''}>${escapeHtml(p.item_name)} (${p.post_type})</option>`).join('');

      select.onchange = (e) => {
        renderVerificationAnswersList(e.target.value);
      };
    }

    renderVerificationAnswersList(filterPostId);
    switchVerifModalTab('answers');
    modal.classList.add('active');
  }

  function renderVerificationAnswersList(targetPostId = 'ALL') {
    const user = marbsDB.getCurrentUser();
    if (!user) return;

    const list = $('#postVerificationsList');
    const countLabel = $('#postVerificationsCountLabel');
    if (!list) return;

    // Find all matches/claims where this post is owned by current user (or all if admin)
    const userPosts = (marbsDB.data.posts || []).filter(p =>
      (p.user_id && p.user_id === user.user_id) ||
      (p.poster_id && p.poster_id === user.user_id) ||
      (user.role === 'ADMIN') ||
      (user.user_id === 'USR-ADMIN' && (p.user_id === 'USR-ADMIN' || p.user_id === 'USR-GUEST'))
    );
    const userPostIds = new Set(userPosts.map(p => p.post_id));

    let relevantMatches = (marbsDB.data.matches || []).filter(m => {
      // Must pertain to one of user's posts
      const isRelated = userPostIds.has(m.lost_post_id) || userPostIds.has(m.found_post_id);
      // And submitted by someone else (or if admin, show all)
      return isRelated && (user.role === 'ADMIN' || m.claimant_id !== user.user_id);
    });

    if (targetPostId && targetPostId !== 'ALL') {
      relevantMatches = relevantMatches.filter(m => m.lost_post_id === targetPostId || m.found_post_id === targetPostId);
    }

    if (countLabel) {
      countLabel.textContent = `Received Answers (${relevantMatches.length} response${relevantMatches.length === 1 ? '' : 's'})`;
    }

    if (relevantMatches.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 36px 20px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius-md);">
          <div style="font-size: 28px; margin-bottom: 8px;">📬</div>
          <strong style="color: var(--text-main); font-size: 14px;">No Private Verification Answers Yet</strong>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px; max-width: 400px; margin-left: auto; margin-right: auto;">
            When another citizen submits answers to verify ownership or reports finding your item, their private answers will appear securely here for your review.
          </p>
        </div>
      `;
      return;
    }

    list.innerHTML = relevantMatches.map(m => {
      // Find matching post
      const post = (marbsDB.data.posts || []).find(p => p.post_id === m.lost_post_id || p.post_id === m.found_post_id) || {
        item_name: 'Lost / Found Item',
        post_type: 'POST',
        image: 'assets/images.jpg',
        general_location: 'Koronadal'
      };

      const claimant = (marbsDB.data.users || []).find(u => u.user_id === m.claimant_id) || {
        first_name: 'Citizen',
        public_alias: 'Citizen Claimant',
        verification_status: 'VERIFIED'
      };

      const qna = m.qna_responses || {};
      const statusColor = m.status === 'MATCH_CONFIRMED' || m.status === 'RETURN_SCHEDULED' ? '#10b981' :
                          m.status === 'MATCH_REJECTED' ? '#ef4444' : '#2563eb';

      return `
        <div class="card" style="border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Top info bar -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
            <div style="display: flex; gap: 12px; align-items: center;">
              <img src="${post.image || 'assets/images.jpg'}" style="width: 46px; height: 46px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border);" onerror="this.src='assets/images.jpg'">
              <div>
                <span class="post-badge ${post.post_type === 'LOST' ? 'badge-lost' : 'badge-found'}" style="font-size: 10px; padding: 2px 6px;">${post.post_type || 'POST'}</span>
                <strong style="display: block; font-size: 14px; margin-top: 2px; color: var(--text-main);">${escapeHtml(post.item_name)}</strong>
                <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(post.general_location || 'Koronadal')}</span>
              </div>
            </div>
            <div style="text-align: right;">
              <span style="background: ${statusColor}15; color: ${statusColor}; font-weight: 800; font-size: 11px; padding: 3px 8px; border-radius: 12px; display: inline-block;">
                ${m.status || 'VERIFICATION_IN_PROGRESS'}
              </span>
              <div style="font-size: 11px; color: var(--text-subtle); margin-top: 4px;">
                ${m.created_at ? new Date(m.created_at).toLocaleDateString() : 'Recent'}
              </div>
            </div>
          </div>

          <!-- Claimant Badge -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <div>
              <span style="color: var(--text-muted);">Submitted by:</span>
              <strong style="color: var(--text-main); margin-left: 4px;">${escapeHtml(claimant.public_alias || claimant.first_name)}</strong>
              ${claimant.verification_status === 'VERIFIED' ? `
                <span style="background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px; margin-left: 4px;">ID VERIFIED</span>
              ` : ''}
            </div>
            <div style="font-size: 11px; color: #2563eb; font-weight: 700;">
              Match Score: ${m.match_score || 90}%
            </div>
          </div>

          <!-- Verification Answer Toggle Button -->
          <button type="button" class="verif-toggle-btn" id="toggleVerifBtn_${m.match_id}" onclick="window.toggleVerificationAnswers('${m.match_id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>View Verification Answers</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left: auto;"><polyline points="6 9 12 15 18 9"/></svg>
          </button>

          <!-- Private Q&A Answers Grid (Hidden by Default) -->
          <div class="verif-answers-hidden-body" id="verifAnswersBody_${m.match_id}">
            <div style="background: #fafafa; border: 1px solid #f1f5f9; border-radius: 8px; padding: 12px; font-size: 12px; display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
              <div style="font-weight: 800; color: #1e3a8a; font-size: 12px; display: flex; align-items: center; gap: 5px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Submitted Verification Answers:
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
                <div style="background: #fff; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                  <div style="color: var(--text-muted); font-size: 11px; font-weight: 600;">1. Location:</div>
                  <div style="color: var(--text-main); font-weight: 600; margin-top: 2px;">${escapeHtml(qna.location_lost || 'Not provided')}</div>
                </div>

                <div style="background: #fff; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                  <div style="color: var(--text-muted); font-size: 11px; font-weight: 600;">2. Approximate Time:</div>
                  <div style="color: var(--text-main); font-weight: 600; margin-top: 2px;">${escapeHtml(qna.approx_time || 'Not provided')}</div>
                </div>

                <div style="background: #fff; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                  <div style="color: var(--text-muted); font-size: 11px; font-weight: 600;">3. Color & Markings:</div>
                  <div style="color: var(--text-main); font-weight: 600; margin-top: 2px;">${escapeHtml(qna.color || 'Not provided')}</div>
                </div>

                ${qna.identifying_marks ? `
                  <div style="background: #fff; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="color: var(--text-muted); font-size: 11px; font-weight: 600;">4. Distinct Identifying Marks:</div>
                    <div style="color: var(--text-main); font-weight: 600; margin-top: 2px;">${escapeHtml(qna.identifying_marks)}</div>
                  </div>
                ` : ''}

                ${qna.accessories ? `
                  <div style="background: #fff; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="color: var(--text-muted); font-size: 11px; font-weight: 600;">5. Attached Accessories / Charms:</div>
                    <div style="color: var(--text-main); font-weight: 600; margin-top: 2px;">${escapeHtml(qna.accessories)}</div>
                  </div>
                ` : ''}

                ${qna.inside_contents ? `
                  <div style="background: #fff; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="color: var(--text-muted); font-size: 11px; font-weight: 600;">6. Inside Contents (if bag/wallet):</div>
                    <div style="color: var(--text-main); font-weight: 600; margin-top: 2px;">${escapeHtml(qna.inside_contents)}</div>
                  </div>
                ` : ''}

                <div style="background: #fefce8; padding: 8px 10px; border-radius: 6px; border: 1px solid #fef08a;">
                  <div style="color: #854d0e; font-size: 11px; font-weight: 700;">★ Secret Proof / Unique Characteristic:</div>
                  <div style="color: #713f12; font-weight: 700; margin-top: 2px;">${escapeHtml(qna.private_proof || 'Not provided')}</div>
                </div>

                ${(qna.proof_photo_url || m.proof_photo_url) ? `
                  <div style="background: #f0fdf4; padding: 10px 12px; border-radius: 6px; border: 1px solid #bbf7d0; margin-top: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <span style="color: #166534; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 5px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        📸 Captured Photo Proof:
                      </span>
                      <span style="background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 10px;">
                        ${qna.camera_verification_status === 'GALLERY_UPLOAD' ? 'UPLOADED PHOTO' : 'LIVE CAMERA VERIFIED'}
                      </span>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: center;">
                      <img src="${qna.proof_photo_url || m.proof_photo_url}" alt="Verification Proof" style="width: 90px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #86efac; cursor: pointer; transition: transform 0.15s ease;" onclick="window.openImageZoomModal('${qna.proof_photo_url || m.proof_photo_url}')" title="Click to inspect full photo" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                      <div style="font-size: 11px; color: #166534; line-height: 1.5;">
                        <div style="font-weight: 600;">Authentic photo proof submitted by claimant</div>
                        ${qna.proof_photo_hash ? `<div style="font-family: monospace; font-size: 10px; color: #15803d; margin-top: 3px; word-break: break-all;">Hash: ${escapeHtml(qna.proof_photo_hash)}</div>` : ''}
                        <div style="margin-top: 6px;">
                          <button type="button" class="btn btn-outline" style="font-size: 10px; padding: 3px 8px; color: #15803d; border-color: #86efac; background: #fff;" onclick="window.openImageZoomModal('${qna.proof_photo_url || m.proof_photo_url}')">
                            🔍 Inspect Full Photo
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
            <button type="button" class="btn btn-outline" style="font-size: 11px; padding: 6px 12px;" onclick="window.openMessengerForPost('${post.post_id}', '${m.claimant_id}')">
              Open Private Chat
            </button>
            <button type="button" class="btn btn-outline" style="font-size: 11px; padding: 6px 12px; color: #ef4444; border-color: #fca5a5;" onclick="window.rejectVerificationMatch('${m.match_id}')">
              Reject Claim
            </button>
            <button type="button" class="btn btn-primary" style="font-size: 11px; padding: 6px 14px;" onclick="window.acceptVerificationMatch('${m.match_id}', '${post.post_id}')">
              ✓ Accept & Schedule Return
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.openImageZoomModal = function (src) {
    const modal = document.getElementById('imageZoomModal');
    const img = document.getElementById('imageZoomModalImg');
    if (!modal || !img || !src) return;
    img.src = src;
    modal.classList.add('active');
  };

  window.openVerificationsModal = openVerificationsModal;
  window.openPostVerificationAnswers = function (postId) {
    openVerificationsModal(postId);
  };

  window.acceptVerificationMatch = function (matchId, postId) {
    const match = (marbsDB.data.matches || []).find(m => m.match_id === matchId);
    if (!match) return;

    match.status = 'MATCH_CONFIRMED';
    marbsDB.logAudit('MATCH_CONFIRMED', `Post owner confirmed match ${matchId}`);
    marbsDB.save();

    window._activeSchedulingMatchId = matchId;
    window._activeSchedulingPostId = postId;
    window._activeSchedulingClaimantId = match.claimant_id;

    $('#postVerificationsModal').classList.remove('active');
    
    // Open Safe Return scheduler modal
    $('#meetupModal').classList.add('active');
    showToast('✓ Match accepted! Select an official Safe Pickup Place to schedule the return.');
    renderUserDashboard();
    updateNotificationBadges();
  };

  window.rejectVerificationMatch = function (matchId) {
    if (!confirm('Are you sure the submitted answers do not match your item? This will decline the claim.')) return;
    const match = (marbsDB.data.matches || []).find(m => m.match_id === matchId);
    if (!match) return;

    match.status = 'MATCH_REJECTED';
    marbsDB.logAudit('MATCH_REJECTED', `Post owner declined claim ${matchId}`);
    marbsDB.save();

    showToast('Claim was declined.');
    renderVerificationAnswersList($('#postVerificationsFilterSelect')?.value || 'ALL');
    updateNotificationBadges();
  };

  window.showDashboardTab = function(tabName) {
    if (tabName === 'overview') {
      const el = $('#myPostsTbody');
      if (el) el.closest('.table-responsive').scrollIntoView({ behavior: 'smooth' });
    } else if (tabName === 'meetups') {
      const el = $('#myMeetupsContainer');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // =========================================================================
  // VERIFICATION ANSWERS TOGGLE
  // =========================================================================
  window.toggleVerificationAnswers = function(matchId) {
    const body = document.getElementById('verifAnswersBody_' + matchId);
    const btn = document.getElementById('toggleVerifBtn_' + matchId);
    if (!body || !btn) return;

    const isVisible = body.classList.contains('visible');
    if (isVisible) {
      body.classList.remove('visible');
      btn.classList.remove('active');
      btn.querySelector('span').textContent = 'View Verification Answers';
    } else {
      body.classList.add('visible');
      btn.classList.add('active');
      btn.querySelector('span').textContent = 'Hide Verification Answers';
    }
  };

  // =========================================================================
  // EDIT PROFILE & PHOTO
  // =========================================================================
  let _pendingAvatarDataUrl = null;

  window.openEditProfileModal = function() {
    const user = marbsDB.getCurrentUser();
    if (!user) {
      openLoginModal();
      showToast('Please log in to edit your profile.');
      return;
    }

    // Fill form fields
    const modal = $('#editProfileModal');
    if (!modal) return;

    $('#editFirstName').value = user.first_name || '';
    $('#editMiddleName').value = user.middle_name || '';
    $('#editLastName').value = user.last_name || '';
    $('#editPhone').value = user.phone || '';
    const brgySelect = $('#editBarangay');
    if (brgySelect && user.barangay) {
      brgySelect.value = user.barangay;
    }

    // Preview avatar
    _pendingAvatarDataUrl = user.avatar_url || null;
    _renderEditAvatarPreview(user);

    modal.classList.add('active');
  };

  function _renderEditAvatarPreview(user) {
    const preview = $('#editProfileAvatarPreview');
    if (!preview) return;
    if (_pendingAvatarDataUrl) {
      preview.innerHTML = `<img src="${_pendingAvatarDataUrl}" alt="Profile">`;
    } else {
      preview.innerHTML = `<span id="editProfileAvatarInitial">${(user.first_name ? user.first_name[0] : 'U').toUpperCase()}</span>`;
    }
  }

  // File input handler
  const editFileInput = document.getElementById('editProfileFileInput');
  if (editFileInput) {
    editFileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      _compressAndSetAvatar(file);
    });
  }

  // Compress/resize to max 320x320 JPEG to prevent localStorage bloat
  function _compressAndSetAvatar(file) {
    const reader = new FileReader();
    reader.onload = function(ev) {
      const img = new Image();
      img.onload = function() {
        const maxSize = 320;
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
        else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        _pendingAvatarDataUrl = canvas.toDataURL('image/jpeg', 0.8);

        const user = marbsDB.getCurrentUser();
        _renderEditAvatarPreview(user || { first_name: 'U' });
        showToast('📷 Photo ready! Click Save to apply.');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  window.takeProfilePhoto = function() {
    // Open camera modal using existing marbsCamera system
    if (window.marbsCamera) {
      window.marbsCamera.open({
        category: 'profile_photo',
        onCapture: function(payload) {
          const imgData = payload && (payload.image_data || payload.dataUrl);
          if (imgData) {
            // Compress the camera capture
            const img = new Image();
            img.onload = function() {
              const maxSize = 320;
              let w = img.width, h = img.height;
              if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
              else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              canvas.getContext('2d').drawImage(img, 0, 0, w, h);
              _pendingAvatarDataUrl = canvas.toDataURL('image/jpeg', 0.8);
              const user = marbsDB.getCurrentUser();
              _renderEditAvatarPreview(user || { first_name: 'U' });
              showToast('📸 Photo captured! Click Save to apply.');
            };
            img.src = imgData;
          }
        }
      });
    } else {
      // Fallback: trigger file input
      document.getElementById('editProfileFileInput').click();
    }
  };

  window.removeProfilePhoto = function() {
    _pendingAvatarDataUrl = null;
    const user = marbsDB.getCurrentUser();
    _renderEditAvatarPreview(user || { first_name: 'U' });
    showToast('Photo removed. Click Save to apply.');
  };

  window.saveEditProfile = function() {
    const user = marbsDB.getCurrentUser();
    if (!user) return;

    const firstName = ($('#editFirstName').value || '').trim();
    const middleName = ($('#editMiddleName').value || '').trim();
    const lastName = ($('#editLastName').value || '').trim();
    const phone = ($('#editPhone').value || '').trim();
    const barangay = $('#editBarangay').value;

    if (!firstName || !lastName) {
      showToast('⚠️ First name and last name are required.');
      return;
    }

    // Update user in marbsDB
    user.first_name = firstName;
    user.middle_name = middleName;
    user.last_name = lastName;
    user.phone = phone;
    user.barangay = barangay;
    user.avatar_url = _pendingAvatarDataUrl || null;

    marbsDB.save();

    // Sync to Supabase if available
    if (window.supabaseClient && user.user_id && !user.user_id.startsWith('USR-')) {
      try {
        window.supabaseClient.from('users').update({
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          phone: phone,
          barangay: barangay,
          avatar_url: _pendingAvatarDataUrl || null
        }).eq('user_id', user.user_id).then(() => {});
      } catch(e) { /* silent */ }
    }

    // Refresh UI
    renderUserDashboard();
    renderUserPill();
    $('#editProfileModal').classList.remove('active');
    showToast('✅ Profile updated successfully!');
  };

  // =========================================================================
  // CONFIRMED SAFE MEETUPS & COMPLETED TRANSACTIONS
  // =========================================================================
  function switchMeetupsTab(tab) {
    const activeBtn = $('#meetupsTabActiveBtn');
    const historyBtn = $('#meetupsTabHistoryBtn');
    const activeContent = $('#meetupsActiveTabContent');
    const historyContent = $('#meetupsHistoryTabContent');

    if (tab === 'history') {
      if (activeBtn) activeBtn.classList.remove('active');
      if (historyBtn) historyBtn.classList.add('active');
      if (activeContent) activeContent.style.display = 'none';
      if (historyContent) historyContent.style.display = 'block';
    } else {
      if (historyBtn) historyBtn.classList.remove('active');
      if (activeBtn) activeBtn.classList.add('active');
      if (historyContent) historyContent.style.display = 'none';
      if (activeContent) activeContent.style.display = 'block';
    }
  }
  window.switchMeetupsTab = switchMeetupsTab;

  function renderMeetupsView() {
    const user = marbsDB.getCurrentUser();
    if (!user) return;

    const allMeetups = marbsDB.data.meetups || [];
    let userMeetups = allMeetups.filter(m =>
      user.role === 'ADMIN' || m.owner_id === user.user_id || m.finder_id === user.user_id
    );

    const activeMeetups = userMeetups.filter(m => m.status !== 'COMPLETED' && m.status !== 'CANCELLED');
    const completedMeetups = userMeetups.filter(m => m.status === 'COMPLETED');

    const activeCountBadge = $('#meetupsActiveCountBadge');
    const historyCountBadge = $('#meetupsHistoryCountBadge');
    const navBadge = $('#navMeetupsBadge');

    if (activeCountBadge) activeCountBadge.textContent = activeMeetups.length;
    if (historyCountBadge) historyCountBadge.textContent = completedMeetups.length;
    if (navBadge) {
      if (activeMeetups.length > 0) {
        navBadge.style.display = 'inline-block';
        navBadge.textContent = activeMeetups.length;
      } else {
        navBadge.style.display = 'none';
      }
    }

    const activeList = $('#activeMeetupsList');
    if (activeList) {
      if (activeMeetups.length === 0) {
        activeList.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; background: #fff; border: 1px dashed var(--border); border-radius: var(--radius-md);">
            <div style="font-size: 32px; margin-bottom: 10px;">📅</div>
            <strong style="font-size: 15px; color: var(--text-main);">No Upcoming Safe Meetups Scheduled</strong>
            <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px; max-width: 440px; margin-left: auto; margin-right: auto;">
              When you confirm an ownership verification match and arrange a return at an official Safe Pickup Place, your confirmed schedule will appear securely here.
            </p>
            <div style="margin-top: 16px;">
              <button type="button" class="btn btn-primary" onclick="window.openVerificationsModal()">
                Review Verification Answers
              </button>
            </div>
          </div>
        `;
      } else {
        activeList.innerHTML = activeMeetups.map(m => {
          const post = (marbsDB.data.posts || []).find(p => p.post_id === m.post_id) || {
            item_name: 'Lost / Found Item',
            post_type: 'POST',
            image: 'assets/images.jpg',
            general_location: 'Koronadal'
          };

          const counterpartyId = (user.user_id === m.owner_id) ? m.finder_id : m.owner_id;
          const counterparty = (marbsDB.data.users || []).find(u => u.user_id === counterpartyId) || {
            first_name: 'Verified Citizen',
            public_alias: 'Citizen #vOIUJk',
            verification_status: 'VERIFIED'
          };
          const reliability = getUserReliability(counterpartyId);
          const isOwner = user.role === 'ADMIN' || user.user_id === m.owner_id;

          return `
            <div class="meetup-schedule-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
                <div style="display: flex; gap: 14px; align-items: center;">
                  <img src="${post.image || 'assets/images.jpg'}" style="width: 64px; height: 64px; border-radius: 10px; object-fit: cover; border: 1px solid var(--border);" onerror="this.src='assets/images.jpg'">
                  <div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span class="post-badge ${post.post_type === 'LOST' ? 'badge-lost' : 'badge-found'}" style="font-size: 10px; padding: 2px 7px;">${post.post_type || 'POST'}</span>
                      <strong style="font-size: 16px; color: var(--text-main);">${escapeHtml(post.item_name)}</strong>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px; color: #1e3a8a; font-size: 13px; font-weight: 700;">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span>${escapeHtml(m.place_name)}</span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px; font-size: 12px; color: var(--text-muted); flex-wrap: wrap;">
                      <span style="display: inline-flex; align-items: center; gap: 4px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                        ${m.date}
                      </span>
                      <span style="display: inline-flex; align-items: center; gap: 4px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${m.time}
                      </span>
                    </div>
                  </div>
                </div>

                <div style="text-align: right; min-width: 180px;">
                  <span style="background: #dcfce7; color: #15803d; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: #16a34a;"></span>
                    CONFIRMED SCHEDULE
                  </span>
                  
                  <div style="margin-top: 8px; font-size: 12px;">
                    <div style="color: var(--text-muted); font-size: 11px;">Exchanging with:</div>
                    <strong style="color: var(--text-main); font-size: 13px;">${escapeHtml(counterparty.public_alias || counterparty.first_name)}</strong>
                    <div style="color: ${reliability.hasRatings ? '#f59e0b' : 'var(--text-muted)'}; font-weight: 800; font-size: 11px; margin-top: 1px;">
                      ${reliability.hasRatings
                        ? `★ ${reliability.avg} (${reliability.count} review${reliability.count === 1 ? '' : 's'})`
                        : 'No ratings yet'}
                    </div>
                  </div>
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 18px; padding-top: 14px; border-top: 1px solid #f1f5f9; flex-wrap: wrap;">
                <button type="button" class="btn btn-outline" style="font-size: 12px; padding: 6px 14px;" onclick="window.openMessengerForPost('${post.post_id}', '${counterpartyId}')">
                  💬 Open Messages
                </button>
                ${isOwner ? `
                  <button type="button" class="btn btn-primary" style="font-size: 12px; padding: 6px 16px; background: #16a34a; border-color: #15803d; color: #fff; font-weight: 800;" onclick="window.markMeetupComplete('${m.meetup_id}')">
                    ✓ Mark as Retrieved / Complete
                  </button>
                ` : `
                  <button type="button" class="btn btn-outline" style="font-size: 12px; padding: 6px 14px; color: #16a34a; border-color: #86efac;" onclick="window.confirmReturnStep('${m.meetup_id}', 'FINDER')">
                    ✓ Confirm Handover Done
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const historyList = $('#historyMeetupsList');
    if (historyList) {
      if (completedMeetups.length === 0) {
        historyList.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; background: #fff; border: 1px dashed var(--border); border-radius: var(--radius-md);">
            <div style="font-size: 32px; margin-bottom: 10px;">📜</div>
            <strong style="font-size: 15px; color: var(--text-main);">No Completed Transactions Yet</strong>
            <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px; max-width: 440px; margin-left: auto; margin-right: auto;">
              Completed returns and verified safe meetup transactions will be archived permanently here with ratings and proofs.
            </p>
          </div>
        `;
      } else {
        historyList.innerHTML = completedMeetups.map(m => {
          const post = (marbsDB.data.posts || []).find(p => p.post_id === m.post_id) || {
            item_name: 'Returned Item',
            post_type: 'POST',
            image: 'assets/images.jpg'
          };
          const counterpartyId = (user.user_id === m.owner_id) ? m.finder_id : m.owner_id;
          const counterparty = (marbsDB.data.users || []).find(u => u.user_id === counterpartyId) || {
            first_name: 'Verified Citizen',
            public_alias: 'Citizen #vOIUJk'
          };
          const ratingObj = (marbsDB.data.ratings || []).find(r => r.meetup_id === m.meetup_id) || {
            stars: 5,
            comment: 'Item safely retrieved and verified at the approved pickup point.'
          };

          return `
            <div class="meetup-schedule-card" style="border-left: 4px solid #10b981; background: #fbfdfc;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
                <div style="display: flex; gap: 14px; align-items: center;">
                  <img src="${post.image || 'assets/images.jpg'}" style="width: 58px; height: 58px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border);" onerror="this.src='assets/images.jpg'">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="activity-badge" style="background: #dcfce7; color: #166534; font-weight: 800; font-size: 10px;">✓ COMPLETED & RETRIEVED</span>
                      <strong style="font-size: 15px; color: var(--text-main);">${escapeHtml(post.item_name)}</strong>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
                      Location: <strong>${escapeHtml(m.place_name)}</strong> • Handover Date: ${m.date}
                    </div>
                    <div style="font-size: 12px; color: #15803d; font-weight: 700; margin-top: 3px;">
                      Citizen: ${escapeHtml(counterparty.public_alias || counterparty.first_name)}
                    </div>
                  </div>
                </div>

                <div style="text-align: right; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px;">
                  <div style="color: #f59e0b; font-size: 14px; font-weight: 800;">
                    ${'★'.repeat(ratingObj.stars || 5)} (${ratingObj.stars || 5}.0 Stars)
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px; max-width: 240px; font-style: italic;">
                    "${escapeHtml(ratingObj.comment || 'Verified safe handover completed!')}"
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }
  window.renderMeetupsView = renderMeetupsView;

  window.markMeetupComplete = function(meetupId) {
    const meetup = (marbsDB.data.meetups || []).find(m => m.meetup_id === meetupId);
    if (!meetup) return;

    const user = marbsDB.getCurrentUser();

    meetup.status = 'COMPLETED';
    meetup.completed_at = new Date().toISOString();
    meetup.owner_confirmed_return = true;
    meetup.finder_confirmed_return = true;

    // Update associated post to RESOLVED
    const post = (marbsDB.data.posts || []).find(p => p.post_id === meetup.post_id);
    if (post) {
      post.status = 'RESOLVED';
    }

    marbsDB.logAudit('TRANSACTION_COMPLETED', `Meetup ${meetupId} marked as Retrieved/Completed by ${user ? user.user_id : 'OWNER'}`);
    marbsDB.save();

    showToast('✓ Item marked as Retrieved / Complete! Schedule archived to History.');

    renderMeetupsView();
    renderUserDashboard();
    updateNotificationBadges();

    const targetUserId = (user && user.user_id === meetup.owner_id) ? meetup.finder_id : meetup.owner_id;
    window.openRatingModal(targetUserId, meetupId, meetup.post_id);
  };

  // =========================================================================
  // CITIZEN RELIABILITY RATING MODAL (STARS & REVIEWS)
  // =========================================================================
  let activeRatingTargetUserId = null;
  let activeRatingMeetupId = null;
  let activeRatingPostId = null;
  let selectedRatingStars = 5;

  window.openRatingModal = function(targetUserId, meetupId, postId) {
    activeRatingTargetUserId = targetUserId || 'USR-102';
    activeRatingMeetupId = meetupId;
    activeRatingPostId = postId;
    selectedRatingStars = 5;

    const targetUser = (marbsDB.data.users || []).find(u => u.user_id === activeRatingTargetUserId) || {
      first_name: 'Verified Citizen',
      public_alias: 'Citizen #vOIUJk'
    };

    const post = (marbsDB.data.posts || []).find(p => p.post_id === postId);

    const nameEl = $('#ratingTargetName');
    if (nameEl) nameEl.textContent = targetUser.public_alias || targetUser.first_name;

    const avatarEl = $('#ratingTargetAvatar');
    if (avatarEl) avatarEl.textContent = (targetUser.first_name[0] || 'C').toUpperCase();

    const itemTag = $('#ratingItemNameTag');
    if (itemTag && post) itemTag.textContent = `• ${post.item_name}`;

    window.setRatingStars(5);
    const commentInput = $('#ratingCommentText');
    if (commentInput) commentInput.value = '';

    const modal = $('#ratingModal');
    if (modal) modal.classList.add('active');
  };

  window.setRatingStars = function(stars) {
    selectedRatingStars = stars;
    const labels = {
      1: '★☆☆☆☆ 1 Star — Poor Experience / Disappointing',
      2: '★★☆☆☆ 2 Stars — Below Expectations',
      3: '★★★☆☆ 3 Stars — Good & Honest Citizen',
      4: '★★★★☆ 4 Stars — Very Reliable & Punctual',
      5: '⭐⭐⭐⭐⭐ 5 Stars — Exceptional & Highly Reliable Citizen'
    };

    const labelEl = $('#starPickerLabel');
    if (labelEl) labelEl.textContent = labels[stars] || `${stars} Stars`;

    $$('.star-btn').forEach(btn => {
      const btnStar = Number(btn.dataset.star);
      if (btnStar <= stars) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  };

  window.toggleFeedbackChip = function(btn) {
    btn.classList.toggle('active');
  };

  window.submitCitizenRating = function(e) {
    if (e) e.preventDefault();
    const user = marbsDB.getCurrentUser();
    if (!user) return;

    const comment = ($('#ratingCommentText')?.value || '').trim() || 'Very honest citizen! Safely returned the item.';
    const selectedTags = Array.from($$('.feedback-chip.active')).map(c => c.textContent.replace('✓', '').trim());

    const ratingRecord = {
      rating_id: 'RAT-' + Date.now().toString().slice(-4),
      meetup_id: activeRatingMeetupId,
      post_id: activeRatingPostId,
      rater_id: user.user_id,
      target_user_id: activeRatingTargetUserId,
      stars: selectedRatingStars,
      tags: selectedTags,
      comment: comment,
      created_at: new Date().toISOString()
    };

    if (!Array.isArray(marbsDB.data.ratings)) {
      marbsDB.data.ratings = [];
    }
    marbsDB.data.ratings.unshift(ratingRecord);

    const targetUser = (marbsDB.data.users || []).find(u => u.user_id === activeRatingTargetUserId);
    if (targetUser) {
      const allRatings = marbsDB.data.ratings.filter(r => r.target_user_id === activeRatingTargetUserId);
      const sum = allRatings.reduce((acc, r) => acc + Number(r.stars), 0);
      targetUser.rating_avg = (sum / allRatings.length).toFixed(1);
      targetUser.rating_count = allRatings.length;
    }

    marbsDB.logAudit('RATING_SUBMITTED', `User ${user.user_id} rated ${activeRatingTargetUserId} with ${selectedRatingStars} stars`);
    marbsDB.save();

    $('#ratingModal').classList.remove('active');
    showToast(`⭐ Thank you! Rated ${selectedRatingStars} stars. Reliability score updated on their profile!`);

    renderMeetupsView();
    renderUserDashboard();
    renderUserPill();
  };

  // Universal event delegation for all modal close buttons and backdrop clicks
  document.addEventListener('click', function(e) {
    // 1. If clicked a close button or element inside a close button
    const closeBtn = e.target.closest('.modal-close-btn');
    if (closeBtn) {
      const modal = closeBtn.closest('.modal-overlay');
      if (modal) {
        modal.classList.remove('active');
        if (modal.id === 'cameraModal' && window.marbsCamera) {
          window.marbsCamera.close();
        }
      }
      return;
    }

    // 2. If clicked outside the modal card (on the backdrop overlay)
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('active');
      if (e.target.id === 'cameraModal' && window.marbsCamera) {
        window.marbsCamera.close();
      }
    }
  });

  // Also allow Escape key to close any active modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        m.classList.remove('active');
        if (m.id === 'cameraModal' && window.marbsCamera) {
          window.marbsCamera.close();
        }
      });
    }
  });

  // Boot on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();

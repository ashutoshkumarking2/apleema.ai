import { initAuthObserver, getAuthToken, logoutUser } from "./auth.js";
import { handleGoogleSignIn } from "./authentication.js";

let cachedDashboardData = null;

document.addEventListener("DOMContentLoaded", () => {
  const loginView = document.getElementById("login-view");
  const dashboardView = document.getElementById("dashboard-view");
  const appLoading = document.getElementById("app-loading");
  const googleLoginBtn = document.getElementById("google-login-btn");
  const connectXBtn = document.getElementById("connect-x-btn");
  const disconnectXBtn = document.getElementById("overview-disconnect-btn");
  const settingsDisconnectBtn = document.getElementById("settings-disconnect-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const errorAlert = document.getElementById("error-alert");
  const successAlert = document.getElementById("success-alert");
  const userEmailDisplay = document.getElementById("user-email-display");

  // Mobile Drawer Elements
  const hamburgerBtn = document.getElementById("hamburger-menu-btn");
  const drawerCloseBtn = document.getElementById("drawer-close-btn");
  const drawerOverlay = document.getElementById("mobile-drawer-overlay");
  const sidebarNavDrawer = document.getElementById("sidebar-nav-drawer");

  // Three-Dot Menu Elements
  const threeDotBtn = document.getElementById("three-dot-btn");
  const threeDotDropdown = document.getElementById("three-dot-dropdown");

  // Drawer Toggle Functions
  function openDrawer() {
    if (sidebarNavDrawer) sidebarNavDrawer.classList.add("open");
    if (drawerOverlay) drawerOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    if (sidebarNavDrawer) sidebarNavDrawer.classList.remove("open");
    if (drawerOverlay) drawerOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (hamburgerBtn) hamburgerBtn.addEventListener("click", openDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener("click", closeDrawer);
  if (drawerOverlay) drawerOverlay.addEventListener("click", closeDrawer);

  // Three-Dot Menu Toggle
  if (threeDotBtn && threeDotDropdown) {
    threeDotBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = threeDotDropdown.classList.toggle("open");
      threeDotBtn.setAttribute("aria-expanded", isOpen);
    });

    document.addEventListener("click", (e) => {
      if (!threeDotBtn.contains(e.target) && !threeDotDropdown.contains(e.target)) {
        threeDotDropdown.classList.remove("open");
        threeDotBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Keyboard Escape Handler
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawer();
      if (threeDotDropdown) {
        threeDotDropdown.classList.remove("open");
        if (threeDotBtn) threeDotBtn.setAttribute("aria-expanded", "false");
      }
    }
  });

  // Sidebar Tab Navigation Setup
  const navButtons = document.querySelectorAll(".sidebar-nav .nav-item");
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");
      switchTab(tabName);
      closeDrawer();
    });
  });

  function hideLoadingScreen() {
    if (appLoading) {
      appLoading.style.opacity = "0";
      setTimeout(() => { appLoading.style.display = "none"; }, 300);
    }
  }

  function showError(msg) {
    if (!errorAlert) return;
    errorAlert.textContent = msg;
    errorAlert.style.display = "flex";
    setTimeout(() => { errorAlert.style.display = "none"; }, 6000);
  }

  function showSuccess(msg) {
    if (!successAlert) return;
    successAlert.textContent = msg;
    successAlert.style.display = "flex";
    setTimeout(() => { successAlert.style.display = "none"; }, 6000);
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", async () => {
      try {
        googleLoginBtn.disabled = true;
        googleLoginBtn.querySelector("span").textContent = "Connecting to Google...";
        await handleGoogleSignIn();
      } catch (err) {
        showError("Google Sign-In failed.");
        googleLoginBtn.disabled = false;
        googleLoginBtn.querySelector("span").textContent = "Sign in with Google";
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to sign out of apleema.ai?")) {
        logoutUser();
      }
    });
  }

  if (connectXBtn) {
    connectXBtn.addEventListener("click", async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          showError("Session expired. Please sign in again.");
          return;
        }
        window.location.href = `/api/auth/x/login?token=${encodeURIComponent(token)}`;
      } catch (err) {
        showError("Failed to initiate X connection.");
      }
    });
  }

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your X account?")) return;
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/x/disconnect", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        showSuccess("X account disconnected successfully.");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showError("Failed to disconnect.");
      }
    } catch (err) {
      showError("Network error.");
    }
  };

  if (disconnectXBtn) disconnectXBtn.addEventListener("click", handleDisconnect);
  if (settingsDisconnectBtn) settingsDisconnectBtn.addEventListener("click", handleDisconnect);

  initAuthObserver(
    async (user, idToken) => {
      hideLoadingScreen();
      if (loginView) loginView.style.display = "none";
      if (dashboardView) dashboardView.style.display = "flex";
      if (userEmailDisplay) userEmailDisplay.textContent = user.email || "";
      await loadDashboardData(idToken);
    },
    () => {
      hideLoadingScreen();
      if (dashboardView) dashboardView.style.display = "none";
      if (loginView) loginView.style.display = "flex";
    }
  );
});

// Three-Dot Menu Actions
window.menuActionProfile = function() {
  if (cachedDashboardData && cachedDashboardData.profile && cachedDashboardData.profile.username) {
    window.open(`https://twitter.com/${cachedDashboardData.profile.username}`, '_blank', 'noopener');
  } else {
    showError("X profile information not loaded yet.");
  }
};

window.menuActionRefresh = async function() {
  await refreshDashboardData();
  showSuccess("Dashboard data refreshed successfully.");
};

window.menuActionConnections = function() {
  switchTab("settings");
};

window.menuActionSettings = function() {
  switchTab("settings");
};

window.menuActionHelp = function() {
  alert("apleema.ai Help & API Access:\n\n- Ensure your X Developer Portal app has Basic tier or higher access to view followers, following, and tweets.\n- All tokens are securely stored on the server using PKCE OAuth 2.0 and Firebase Auth.");
};

window.menuActionLogout = function() {
  if (confirm("Are you sure you want to sign out of apleema.ai?")) {
    logoutUser();
  }
};

window.switchTab = function(tabName) {
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(btn => {
    if (btn.getAttribute("data-tab") === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  document.querySelectorAll(".dashboard-section").forEach(sec => {
    sec.classList.remove("active");
  });

  const targetSection = document.getElementById(`section-${tabName}`);
  if (targetSection) {
    targetSection.classList.add("active");
  }
};

window.refreshDashboardData = async function() {
  const token = await getAuthToken();
  if (token) {
    await loadDashboardData(token);
    const timeEl = document.getElementById("last-refreshed-time");
    if (timeEl) {
      timeEl.textContent = `Last refreshed: ${new Date().toLocaleTimeString()}`;
    }
  }
};

async function loadDashboardData(idToken) {
  const xConnectCard = document.getElementById("x-connect-card");
  const sectionsContainer = document.getElementById("dashboard-sections-container");

  try {
    const res = await fetch("/api/x/data", {
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    const data = await res.json();
    cachedDashboardData = data;

    if (data.connected && data.profile) {
      if (xConnectCard) xConnectCard.style.display = "none";
      if (sectionsContainer) sectionsContainer.style.display = "block";

      renderOverview(data.profile, data.posts, data.errors?.posts);
      renderPostsList("my-posts-list", data.posts, data.errors?.posts);
      renderPostsList("my-replies-list", data.replies);
      renderPostsList("my-media-list", data.media);
      renderPostsList("my-likes-list", data.likes);
      renderUsersList("followers-list", data.followers, null);
      renderFollowingList(data.following, null);

      const timeEl = document.getElementById("last-refreshed-time");
      if (timeEl) {
        timeEl.textContent = `Last refreshed: ${new Date().toLocaleTimeString()}`;
      }
    } else {
      if (xConnectCard) xConnectCard.style.display = "flex";
      if (sectionsContainer) sectionsContainer.style.display = "none";
    }
  } catch (err) {
    console.error("Failed to load dashboard data:", err);
    if (xConnectCard) xConnectCard.style.display = "flex";
  }
}

function renderOverview(profile, posts, apiError) {
  document.getElementById("overview-name").textContent = profile.name || "X User";
  document.getElementById("overview-username").textContent = `@${profile.username || "unknown"}`;
  if (profile.profile_image_url) {
    document.getElementById("overview-avatar").src = profile.profile_image_url;
  }
  document.getElementById("overview-bio").textContent = profile.description || "No bio available.";
  
  if (profile.verified) {
    document.getElementById("overview-verified-badge").style.display = "inline-block";
  }

  const metrics = profile.public_metrics || {};
  document.getElementById("profile-stats").innerHTML = `
    <div class="stat-box"><strong>${metrics.followers_count || 0}</strong> Followers</div>
    <div class="stat-box"><strong>${metrics.following_count || 0}</strong> Following</div>
    <div class="stat-box"><strong>${metrics.tweet_count || 0}</strong> Total Posts</div>
  `;

  document.getElementById("quick-follower-count").textContent = `${metrics.followers_count || 0} followers connected`;
  document.getElementById("quick-following-count").textContent = `${metrics.following_count || 0} accounts followed`;

  if (profile.created_at) {
    document.getElementById("overview-created").textContent = `Joined ${new Date(profile.created_at).toLocaleDateString()}`;
  }

  const profileUrl = document.getElementById("overview-profile-url");
  profileUrl.href = `https://twitter.com/${profile.username}`;

  renderPostsList("overview-latest-posts", posts.slice(0, 3), apiError, "overview-posts-notice");
}

function renderPostsList(containerId, posts, apiError = null, noticeId = "posts-api-notice") {
  const container = document.getElementById(containerId);
  const noticeEl = document.getElementById(noticeId);
  if (!container) return;

  if (apiError && noticeEl) {
    noticeEl.textContent = `[HTTP ${apiError.status}] ${apiError.title}: ${apiError.detail}`;
    noticeEl.style.display = "block";
  } else if (noticeEl) {
    noticeEl.style.display = "none";
  }

  container.innerHTML = "";
  if (!posts || posts.length === 0) {
    if (!apiError) {
      container.innerHTML = `<p class="empty-state">No recent posts found for this account.</p>`;
    }
    return;
  }

  posts.forEach(post => {
    const card = document.createElement("div");
    card.className = "post-card";
    const metrics = post.public_metrics || {};
    const postUrl = `https://twitter.com/user/status/${post.id}`;

    card.innerHTML = `
      <p class="post-text">${escapeHtml(post.text)}</p>
      <div class="post-meta">
        <span>📅 ${new Date(post.created_at).toLocaleDateString()}</span>
        <div class="post-metrics">
          <span class="metric-item">❤️ ${metrics.like_count || 0}</span>
          <span class="metric-item">🔄 ${metrics.repost_count || 0}</span>
          <span class="metric-item">💬 ${metrics.reply_count || 0}</span>
          <span class="metric-item">👁️ ${metrics.impression_count || 0}</span>
        </div>
      </div>
      <div class="post-actions-row">
        <a href="${postUrl}" target="_blank" rel="noopener" class="btn secondary-btn small-btn">Open on X &rarr;</a>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderUsersList(containerId, users, apiError) {
  const container = document.getElementById(containerId);
  const noticeEl = document.getElementById("followers-notice");
  if (!container) return;

  if (apiError && noticeEl) {
    noticeEl.textContent = `[HTTP ${apiError.status}] ${apiError.title}: ${apiError.detail}`;
    noticeEl.style.display = "block";
  } else if (noticeEl) {
    noticeEl.style.display = "none";
  }

  container.innerHTML = "";
  if (!users || users.length === 0) {
    container.innerHTML = `<p class="empty-state">No followers returned or access restricted.</p>`;
    return;
  }

  users.forEach(user => {
    const card = document.createElement("div");
    card.className = "user-card card";
    const metrics = user.public_metrics || {};

    card.innerHTML = `
      <div class="user-header">
        <img src="${user.profile_image_url || 'apleema.png'}" alt="Avatar" class="user-avatar">
        <div>
          <h4>${escapeHtml(user.name)}</h4>
          <span class="secondary-text">@${user.username}</span>
        </div>
      </div>
      <p class="user-bio">${escapeHtml(user.description || "No bio")}</p>
      <div class="user-footer">
        <span>${metrics.followers_count || 0} followers</span>
        <a href="https://twitter.com/${user.username}" target="_blank" rel="noopener" class="btn secondary-btn small-btn">View Profile</a>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderFollowingList(users, apiError) {
  const container = document.getElementById("following-list");
  const noticeEl = document.getElementById("following-notice");
  if (!container) return;

  if (apiError && noticeEl) {
    noticeEl.textContent = `[HTTP ${apiError.status}] ${apiError.title}: ${apiError.detail}`;
    noticeEl.style.display = "block";
  } else if (noticeEl) {
    noticeEl.style.display = "none";
  }

  container.innerHTML = "";
  if (!users || users.length === 0) {
    container.innerHTML = `<p class="empty-state">No following accounts returned.</p>`;
    return;
  }

  users.forEach(user => {
    const card = document.createElement("div");
    card.className = "user-card card clickable-card";
    const metrics = user.public_metrics || {};

    card.innerHTML = `
      <div class="user-header">
        <img src="${user.profile_image_url || 'apleema.png'}" alt="Avatar" class="user-avatar">
        <div>
          <h4>${escapeHtml(user.name)}</h4>
          <span class="secondary-text">@${user.username}</span>
        </div>
      </div>
      <p class="user-bio">${escapeHtml(user.description || "No bio")}</p>
      <div class="user-footer">
        <span>${metrics.followers_count || 0} followers</span>
        <button class="btn primary-btn small-btn" onclick="openUserDashboard('${user.id}')">Inspect Dashboard</button>
      </div>
    `;
    container.appendChild(card);
  });
}

window.openUserDashboard = async function(userId) {
  switchTab("user-detail");
  const profileCard = document.getElementById("target-user-profile-card");
  const postsContainer = document.getElementById("target-user-posts-list");

  profileCard.innerHTML = `<p class="loading-text">Loading profile dashboard...</p>`;
  postsContainer.innerHTML = "";

  try {
    const token = await getAuthToken();
    const res = await fetch(`/api/x/user/${userId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.profile) {
      const u = data.profile;
      const m = u.public_metrics || {};
      profileCard.innerHTML = `
        <div class="profile-main-info">
          <img src="${u.profile_image_url || 'apleema.png'}" alt="Avatar" class="profile-avatar-large">
          <div class="profile-titles">
            <h3>${escapeHtml(u.name)}</h3>
            <p class="secondary-text">@${u.username}</p>
          </div>
        </div>
        <p class="profile-bio">${escapeHtml(u.description || "No bio")}</p>
        <div class="profile-stats-grid">
          <div class="stat-box"><strong>${m.followers_count || 0}</strong> Followers</div>
          <div class="stat-box"><strong>${m.following_count || 0}</strong> Following</div>
          <div class="stat-box"><strong>${m.tweet_count || 0}</strong> Posts</div>
        </div>
        <div class="profile-meta-footer">
          <a href="https://twitter.com/${u.username}" target="_blank" rel="noopener">Open profile on X &rarr;</a>
        </div>
      `;

      renderPostsList("target-user-posts-list", data.posts);
    } else {
      profileCard.innerHTML = `<p class="empty-state">Failed to load target account details.</p>`;
    }
  } catch (err) {
    profileCard.innerHTML = `<p class="empty-state">Error loading target account dashboard.</p>`;
  }
};

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
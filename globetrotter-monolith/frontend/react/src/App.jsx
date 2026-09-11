import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Compass,
  Globe2,
  Heart,
  Languages,
  LogOut,
  Map,
  MapPin,
  Menu,
  MessageSquare,
  MessagesSquare,
  Monitor,
  Moon,
  Route as RouteIcon,
  Sparkles,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { useApp } from "./state";
import { validationMessage } from "./i18n";
import { BookingModal, Empty, Loading } from "./components";
import Explore from "./Explore";
import PlaceDetail from "./PlaceDetail";
import Trips from "./Trips";
import { AuthPage, Feedback, Profile } from "./Account";

const Chat = lazy(() => import('./Chat'));
const Recovery = lazy(() => import('./Recovery'));
const Admin = lazy(() => import('./Admin'));

const navigation = [
  ["/", "Explore", Compass],
  ["/map", "City map", Map],
  ["/recommendations", "For you", Sparkles],
  ["/favorites", "Saved places", Heart],
  ["/itineraries", "My trips", RouteIcon],
  ["/planner", "Weekly planner", CalendarDays],
  ["/chat", "Community chat", MessagesSquare],
];
const titles = {
  "/": "Explore",
  "/map": "City map",
  "/recommendations": "For you",
  "/favorites": "Saved places",
  "/itineraries": "My trips",
  "/planner": "Weekly planner",
  "/profile": "My profile",
  "/feedback": "Feedback",
  "/login": "Sign in",
  "/register": "Create account",
  "/forgot-password": "Recover your account",
  "/reset-password": "Reset password",
  "/chat": "Community chat",
  "/admin": "Administration",
};

function RequireAuth({ children }) {
  const { session } = useApp();
  const location = useLocation();
  return session.token ? (
    children
  ) : (
    <Navigate
      to="/login"
      state={{ from: location.pathname + location.search }}
      replace
    />
  );
}
function LegacyRoute() {
  const { translate } = useApp();
  const { legacy } = useParams();
  const location = useLocation();
  const name = legacy.replace(/\.html$/, "");
  const target = name === "index" ? "/" : `/${name}`;
  return legacy.endsWith(".html") && Object.hasOwn(titles, target) ? (
    <Navigate to={target + location.search} replace />
  ) : (
    <Empty title="A little off the map" message="We couldn't find that page.">
      <Link to="/" className="button">
        {translate("Back to exploring")}
      </Link>
    </Empty>
  );
}

function AppearanceControls() {
  const { language, setLanguage, translate } = useApp();
  return (
    <div className="appearance-controls">
      <label className="language-control">
        <Languages size={17} />
        <select
          aria-label={translate("Language")}
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
        >
          <option value="en">EN</option>
          <option value="fr">FR</option>
        </select>
      </label>
    </div>
  );
}

function ThemeControls() {
  const { themePreference, setTheme, translate } = useApp();
  return (
    <div
      className="segmented theme-controls"
      role="group"
      aria-label={translate("Color theme")}
    >
      {[
        ["light", "Switch to light mode", Sun],
        ["dark", "Switch to dark mode", Moon],
        ["system", "Use system theme", Monitor],
      ].map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          aria-label={translate(label)}
          title={translate(label)}
          aria-pressed={themePreference === value}
          className={themePreference === value ? "active" : ""}
          onClick={() => setTheme(value)}
        >
          <Icon size={17} />
        </button>
      ))}
    </div>
  );
}

function Sidebar({ menuOpen, setMenuOpen }) {
  const { session, signOut, favoriteIds, places, translate, number } = useApp();
  const navigate = useNavigate();
  const shortName = session.name.trim().split(" ")[0] || translate("Traveler");
  return (
    <aside
      className={`sidebar ${menuOpen ? "is-open" : ""}`}
      id="main-navigation"
      onClick={(event) => {
        if (event.target.closest("a")) setMenuOpen(false);
      }}
    >
      <Link className="brand" to="/">
        <span className="brand-symbol">
          <Globe2 size={25} strokeWidth={1.7} />
        </span>
        <span>
          globe<span className="brand-light">trotter</span>
          <small>{translate("GO A LITTLE FURTHER")}</small>
        </span>
      </Link>
      <button
        className="icon-button mobile-menu-close"
        aria-label={translate("Close navigation")}
        title={translate("Close navigation")}
        onClick={() => setMenuOpen(false)}
      >
        <X size={22} />
      </button>
      <p className="nav-label">
        {translate("Discover your everyday").toUpperCase()}
      </p>
      <nav aria-label={translate("Main navigation")}>
        {navigation.map(([path, label, Icon], index) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `nav-item ${isActive ? "active" : ""} ${index === 3 ? "nav-divider" : ""}`
            }
          >
            <Icon size={20} strokeWidth={1.7} />
            <span>{translate(label)}</span>
            {path === "/favorites" && favoriteIds.size > 0 && (
              <span className="nav-count">{number(favoriteIds.size)}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        {session.role === 'admin' && <NavLink to="/admin" className="nav-item"><ShieldCheck size={19} />{translate('Administration')}</NavLink>}
        <div className="city-note">
          <span className="city-dot" />
          <div>
            <strong>{translate("Rooted in Yaounde")}</strong>
            <span>
              {places.data?.length
                ? translate(places.data.length === 1 ? "{count} place" : "{count} places", { count: number(places.data.length) })
                : translate("The city of seven hills.")}
            </span>
          </div>
        </div>
        <NavLink to="/feedback" className="nav-item">
          <MessageSquare size={19} />
          {translate("Share feedback")}
        </NavLink>
        <AppearanceControls />
        {session.token ? (
          <div className="sidebar-user">
            <Link to="/profile">
              <span className="avatar">
                {shortName.charAt(0).toUpperCase()}
              </span>
              <span>
                <strong>{shortName}</strong>
                <small>{translate("My account")}</small>
              </span>
            </Link>
            <button
              className="icon-button"
              title={translate("Sign out")}
              aria-label={translate("Sign out")}
              onClick={() => {
                signOut();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <Link className="button sidebar-signin" to="/login">
            {translate("Sign in")}
            <ArrowUpRight size={17} />
          </Link>
        )}
      </div>
    </aside>
  );
}

export default function App() {
  const { session, sessionError, retrySession, signOut, toast, setToast, translate, language } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booking, setBooking] = useState(null);
  const pageTitle = translate(titles[location.pathname] || "Explore");
  useEffect(() => { document.title = `${pageTitle} | GlobeTrotter`; }, [pageTitle]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    setMenuOpen(false);
    setBooking(null);
    window.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const sidebar = document.getElementById("main-navigation");
    if (!sidebar) return;
    const controls = [...sidebar.querySelectorAll("a, button, select")].filter(
      (control) => control.getClientRects().length,
    );
    controls[0]?.focus();
    document.body.style.overflow = "hidden";
    const handleKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key !== "Tab") return;
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === controls.at(-1)
      ) {
        event.preventDefault();
        controls[0]?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [menuOpen]);
  const isAuthPage = /^\/(login|register|forgot-password|reset-password)\/?$/.test(location.pathname);
  if (session.token && !session.verified) {
    return <main className="session-check">{sessionError ? <Empty title="Unable to verify your session" message={sessionError}><button className="button" onClick={retrySession}>{translate("Try again")}</button><button className="button secondary" onClick={signOut}>{translate("Sign out")}</button></Empty> : <Loading />}</main>;
  }
  if (!session.token && !isAuthPage) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search + location.hash }} replace />;
  }
  function plan(place) {
    if (place.active === false) { setToast({ message: 'This destination is archived and unavailable for new plans.', error: true }); return; }
    if (!session.token)
      navigate("/login", { state: { from: `/places/${place.id}` } });
    else setBooking(place);
  }
  const shortName = session.name.trim().split(" ")[0] || translate("Traveler");
  return (
    <div className={`app-shell${isAuthPage ? " auth-shell" : ""}`} onInvalidCapture={event => {
      const input = event.target;
      if (!input.setCustomValidity) return;
      input.setCustomValidity('');
      if (!input.validity.valid) input.setCustomValidity(validationMessage(language, input));
    }} onInputCapture={event => event.target.setCustomValidity?.('')}>
      <a className="skip-link" href="#main-content">
        {translate("Skip to content")}
      </a>
      {!isAuthPage && menuOpen && (
        <button
          className="menu-overlay"
          aria-label={translate("Close navigation")}
          onClick={() => setMenuOpen(false)}
        />
      )}
      {!isAuthPage && <Sidebar menuOpen={menuOpen} setMenuOpen={setMenuOpen} />}
      <div className="main-shell" inert={menuOpen ? true : undefined}>
        <header className="topbar">
          <div className="topbar-left">
            {isAuthPage ? <Link className="brand" to="/login"><Globe2 size={26} /><span>globe<span className="brand-light">trotter</span></span></Link> : <><button
              className="icon-button menu-toggle"
              aria-label={translate("Open navigation")}
              title={translate("Open navigation")}
              aria-expanded={menuOpen}
              aria-controls="main-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              {translate("Your everyday, reimagined")}
            </span>
            <Link to="/" className="mobile-brand">
              <Globe2 size={22} />
              globetrotter
            </Link>
            </>}
          </div>
          <div className="topbar-right">
            <span className="city-location">
              <MapPin size={16} />
              <span>{translate("Yaounde, Cameroon")}</span>
            </span>
            <ThemeControls />
            {isAuthPage ? <AppearanceControls /> : <Link
              className="topbar-account"
              to={session.token ? "/profile" : "/login"}
              aria-label={translate(session.token ? "My profile" : "Sign in")}
            >
              {session.token ? (
                <span className="avatar small">
                  {shortName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <UserRound size={20} />
              )}
              <span>{session.token ? shortName : translate("Sign in")}</span>
            </Link>}
          </div>
        </header>
        <main
          id="main-content"
          className="main-content"
          ref={mainRef}
          tabIndex={-1}
        >
          <Routes>
            <Route path="/" element={<Explore onPlan={plan} />} />
            <Route path="/map" element={<Explore mode="map" onPlan={plan} />} />
            <Route
              path="/places/:id"
              element={<PlaceDetail key={location.pathname} onPlan={plan} />}
            />
            <Route
              path="/favorites"
              element={
                <RequireAuth>
                  <Explore key="favorites" mode="favorites" onPlan={plan} />
                </RequireAuth>
              }
            />
            <Route
              path="/recommendations"
              element={
                <RequireAuth>
                  <Explore
                    key="recommendations"
                    mode="recommendations"
                    onPlan={plan}
                  />
                </RequireAuth>
              }
            />
            <Route
              path="/itineraries"
              element={
                <RequireAuth>
                  <Trips onPlan={plan} />
                </RequireAuth>
              }
            />
            <Route
              path="/planner"
              element={
                <RequireAuth>
                  <Trips planner onPlan={plan} />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/admin" element={<RequireAuth><Suspense fallback={<Loading />}><Admin /></Suspense></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><Suspense fallback={<Loading />}><Chat /></Suspense></RequireAuth>} />
            <Route path="/login" element={<AuthPage key="login" />} />
            <Route path="/forgot-password" element={<Suspense fallback={<Loading />}><Recovery key="forgot" /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={<Loading />}><Recovery key="reset" reset /></Suspense>} />
            <Route
              path="/register"
              element={<AuthPage key="register" register />}
            />
            <Route
              path="/offline.html"
              element={
                <Empty
                  title="You're offline"
                  message="Your places will be here when you're connected again."
                >
                  <Link className="button" to="/">
                    {translate("Try again")}
                  </Link>
                </Empty>
              }
            />
            <Route path="/:legacy" element={<LegacyRoute />} />
            <Route
              path="*"
              element={
                <Empty
                  title="Page not found"
                  message="Let's get you back to the city."
                >
                  <Link to="/" className="button">
                    {translate("Explore")}
                  </Link>
                </Empty>
              }
            />
          </Routes>
          <footer className="page-footer">
            <span>GlobeTrotter</span>
            <span>{translate("Made for a world worth exploring.")}</span>
            {!isAuthPage && <Link to="/feedback">
              {translate("Share feedback")}
              <ArrowUpRight size={13} />
            </Link>}
          </footer>
        </main>
      </div>
      {!isAuthPage && <nav
        className="bottom-nav"
        aria-label={translate("Mobile navigation")}
        inert={menuOpen ? true : undefined}
      >
        {[
          ["/", "Explore", Compass],
          ["/map", "Map", Map],
          ["/favorites", "Saved", Heart],
          ["/itineraries", "Trips", RouteIcon],
          ["/profile", "You", UserRound],
        ].map(([path, label, Icon]) => (
          <NavLink key={path} to={path} end={path === "/"}>
            <Icon size={21} />
            <span>{translate(label)}</span>
          </NavLink>
        ))}
      </nav>}
      {booking && (
        <BookingModal place={booking} onClose={() => setBooking(null)} />
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <X size={18} /> : <Check size={18} />}
          <span>{translate(toast.message, toast.values)}</span>
          <button
            className="icon-button"
            title={translate("Dismiss")}
            aria-label={translate("Dismiss notification")}
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

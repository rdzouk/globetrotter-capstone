# GlobeTrotter Mobile (Flutter)

A Flutter client for the same Flask backend in `../backend/`. It doesn't
replace the backend — it's a second consumer of the exact same REST API
the web pages in `../frontend/` already use.

## Prerequisites

- Flutter SDK installed (`flutter --version` should work). If not:
  https://docs.flutter.dev/get-started/install
- The backend running (`cd ../backend && python app.py`)

## Setup

```bash
cd mobile
flutter pub get
```

## The one thing that WILL trip you up: the backend URL

`lib/services/api_service.dart` has:

```dart
static const String baseUrl = "http://10.0.2.2:5000";
```

`10.0.2.2` is a special address that **only works from the Android
emulator** — it's how the emulator reaches "localhost" on your actual
computer. You need a different value depending on how you're running
the app:

| Where you're running the app | `baseUrl` should be |
|---|---|
| Android emulator | `http://10.0.2.2:5000` (default, already set) |
| iOS simulator | `http://localhost:5000` |
| Physical phone (same Wi-Fi as your computer) | `http://<your-computer's-LAN-IP>:5000`, e.g. `http://192.168.1.42:5000` |
| Flutter web / Chrome | `http://localhost:5000` |

To find your computer's LAN IP:
- **Windows:** `ipconfig` → look for "IPv4 Address"
- **macOS/Linux:** `ifconfig` or `ip addr` → look for your Wi-Fi adapter's `inet` address

Also make sure your Flask backend is listening on all interfaces (it
already is — `app.run(host="0.0.0.0", ...)` in `app.py` — so it's
reachable from other devices on your network, not just from the same
machine).

## Run

```bash
flutter run
```

Pick your target device when prompted (or pass `-d chrome`, `-d
<emulator-id>`, etc.).

## What's implemented

- **Splash → Login/Register → Home** flow, with the JWT persisted on
  device so you stay logged in between app launches.
- **Login/Register**: name (can duplicate across users) plus your
  choice of email or phone as the unique identifier — toggle between
  them with the segmented button.
- **Explore tab**: search + category/neighborhood filters, a live
  interactive OpenStreetMap (via `flutter_map` — the Flutter
  equivalent of the Leaflet map in the web version) with color-coded
  pins, and a scrollable results list below it.
- **For you tab**: personalized recommendations based on your
  interests from registration.
- **Trips tab**: your saved itineraries; tap "Mark visited & review"
  on any trip to leave a star rating, a comment, and the date you
  actually went — this becomes a public review on that place's detail
  page.
- **Feedback tab**: leave a rating/comment about the app itself, and
  see what other users have said.
- **Settings tab**: light / dark / system theme toggle (persisted on
  device), and log out.

## Project structure

```
mobile/
├── lib/
│   ├── main.dart                 # App entry point, theming, routes
│   ├── models/                   # Place, Itinerary, Review, AppFeedback
│   ├── services/api_service.dart # All HTTP calls to the Flask backend
│   ├── providers/                # AuthProvider (session), ThemeProvider (light/dark)
│   ├── screens/                  # One file per screen
│   └── widgets/place_card.dart   # Shared card used on Explore + Recommendations
└── pubspec.yaml
```

## Feature parity with the web app

The web frontend (`../frontend/`) got a large feature update — live
geolocation + route lines, transport fare estimates, French/English +
dark/light toggles, a weekly timetable planner, and a "nearby places" /
area-info panel. I kept this Flutter app's data model in sync (it now
reads `image_url` and the new `entertainment`/`landmark` categories
without breaking), but **did not port the newer interactive features
into Dart yet** — that's a lot of native-map and native-geolocation
work I'd want to do carefully and iteratively with you, ideally with
you able to `flutter run` and check each piece as it lands, rather
than shipping a large untested batch. Still to port to mobile:
- Live location marker + route line on the Explore map
- Transport mode estimates
- Nearby-places section on place detail
- Area info ("good to know about this neighborhood")
- Weekly timetable/planner screen
- Language toggle (EN/FR) — dark mode is already done

Say the word and I'll pick these up one at a time.

## Known limitation

I wrote and reviewed all of this Dart code carefully, but couldn't
compile or run it myself — this sandbox doesn't have the Flutter SDK
installed. Run `flutter pub get` then `flutter run` and let me know
the exact error text if anything doesn't build; Dart's compiler
errors are usually very specific (file + line number) and easy to fix
from there.

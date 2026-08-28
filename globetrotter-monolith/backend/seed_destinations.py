"""
Seeds the database with the full 58-place Yaoundé dataset, including
real addresses and ratings. Idempotent — upserts by id, so it's safe
to run repeatedly (e.g. after `pytest`, which uses its own isolated
test database and never touches this one — see tests/test_app.py).

IMPORTANT: this checks for your own local photos FIRST, in
../frontend/static/images/places/<id>.jpg (or .jpeg/.png) — if you've
downloaded and named your own photos there, this script uses them and
will NEVER overwrite them with a placeholder. Only places with no local
photo yet get the LoremFlickr placeholder.

Run:
    cd backend
    python seed_destinations.py
"""
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "static", "images", "places")
VALID_EXTENSIONS = [".jpg", ".jpeg", ".png"]


def find_local_image(destination_id):
    for ext in VALID_EXTENSIONS:
        candidate = os.path.join(IMAGES_DIR, f"{destination_id}{ext}")
        if os.path.isfile(candidate):
            return f"/static/images/places/{destination_id}{ext}"
    return None

places = [
  # -------- RESTAURANTS --------
  dict(name="Tassa", category="restaurant", neighborhood="Bastos", address="Derrière l'usine Bastos, entrée commissariat des Diplomates, Yaoundé", lat=3.8856164, lng=11.512473, rating=4.3, rating_count=189, price_level=2, phone="+237 6 56 70 65 66", tags=["restaurant","cafe","casual","garden-seating"], description="Bright garden cafe-restaurant in Bastos with a glass roof, coffee bar, and occasional live jazz nights."),
  dict(name="Complexe le sims", category="restaurant", neighborhood="Bastos", address="Bastos, Yaoundé", lat=3.8842357, lng=11.5173951, rating=4.0, rating_count=217, price_level=2, phone="+237 6 54 48 87 44", tags=["restaurant","bar","sports-bar","casual"], description="Open-air sports-bar-style restaurant in Bastos, popular for drinks and casual hangouts."),
  dict(name="Seven Hills", category="restaurant", neighborhood="Warda", address="Carrefour PJ, Yaoundé", lat=3.870794, lng=11.5233962, rating=4.2, rating_count=276, price_level=2, phone="+237 6 54 77 72 22", tags=["restaurant","pizza","casual"], description="Cozy pizzeria and grill near Carrefour PJ known for its wood-fired pizza and generous portions."),
  dict(name="L'HYBRIDE", category="restaurant", neighborhood="Bastos", address="Bastos, Yaoundé", lat=3.8909426, lng=11.5048124, rating=4.0, rating_count=589, price_level=2, phone="+237 6 95 04 70 08", tags=["restaurant","fancy","garden","cocktails"], description="Stylish Bastos restaurant with a lush garden setting, indoor/outdoor seating, and a cocktail menu."),
  dict(name="continent 237", category="restaurant", neighborhood="Bastos", address="Nv Route Bastos, Yaoundé", lat=3.8849936, lng=11.5095587, rating=4.3, rating_count=54, price_level=3, phone="+237 6 86 56 31 65", tags=["restaurant","fancy","fine-dining","live-music"], description="Upscale fine-dining spot on the Bastos strip with an elegant interior and live music evenings."),
  dict(name="Cosy Pool", category="restaurant", neighborhood="Bastos", address="1866, Rue 1.770, Yaoundé", lat=3.8866235, lng=11.5119583, rating=4.0, rating_count=564, price_level=3, phone="+237 6 98 90 99 48", tags=["restaurant","fancy","fine-dining","french"], description="French-inspired restaurant built around a quiet poolside terrace, popular for romantic dinners."),
  dict(name="Socrat Restaurant", category="restaurant", neighborhood="Bastos", address="Nv Route Bastos, Yaoundé", lat=3.8867605, lng=11.5039059, rating=4.1, rating_count=903, price_level=2, phone="+237 6 90 04 04 04", tags=["restaurant","fancy","lebanese","buffet"], description="Long-running Lebanese restaurant in Bastos with a large buffet and shisha lounge."),
  dict(name="Route 66 Bar & Grill", category="restaurant", neighborhood="Bastos", address="Bastos, Yaoundé", lat=3.8944272, lng=11.5083893, rating=3.8, rating_count=298, price_level=2, phone="+237 6 90 04 90 04", tags=["restaurant","bar","casual","nightlife"], description="American-style bar and grill in Bastos, open late with indoor bar and outdoor seating."),
  dict(name="The Famous", category="restaurant", neighborhood="Bastos", address="Bastos, Yaoundé", lat=3.8927418, lng=11.5181902, rating=4.1, rating_count=805, price_level=3, phone="+237 6 56 89 80 01", tags=["restaurant","fancy","fine-dining","sushi"], description="One of Yaoundé's most talked-about restaurants — elegant decor, sushi, and an extensive dessert buffet."),
  dict(name="Mahima Restaurant", category="restaurant", neighborhood="Elig-Essono", address="Yaoundé", lat=3.8781131, lng=11.5253005, rating=4.1, rating_count=452, price_level=3, phone="+237 6 99 68 91 16", tags=["restaurant","indian","fancy"], description="Spacious Indian restaurant known for its naan and butter chicken, tucked just off the main road."),
  dict(name="Le Safoutier Restaurant", category="restaurant", neighborhood="Centre-ville", address="Hilton Hotel, Bd du 20 mai, Yaoundé", lat=3.8644058, lng=11.5161311, rating=4.0, rating_count=655, price_level=3, phone="+237 6 50 00 29 29", tags=["restaurant","fancy","hotel-restaurant","buffet"], description="The Hilton's signature restaurant, blending French and local cuisine with a weekend poolside buffet."),
  dict(name="Kennys Great House", category="restaurant", neighborhood="Bastos", address="Rue 1.795, Yaoundé", lat=3.8970286, lng=11.5126892, rating=4.0, rating_count=413, price_level=3, phone="+237 6 97 21 30 30", tags=["restaurant","casual","pizza"], description="24-hour restaurant and guesthouse in Bastos serving pizza, grilled chicken, and local dishes."),
  dict(name="Chez Wou", category="restaurant", neighborhood="Bastos", address="1334 Rue Joseph Mballa Eloumden, Yaoundé", lat=3.8909768, lng=11.5141406, rating=4.0, rating_count=559, price_level=3, phone="+237 6 99 91 23 05", tags=["restaurant","chinese","family-friendly"], description="A Bastos institution for Chinese food, with a shaded outdoor terrace and kids' play area."),
  dict(name="La Marmite Du Boulevard", category="restaurant", neighborhood="Centre-ville", address="Bd du 20 mai, Yaoundé", lat=3.8645125, lng=11.5163594, rating=4.0, rating_count=115, price_level=3, phone="+237 6 76 26 64 57", tags=["restaurant","fancy","hotel-restaurant"], description="Relaxed hotel restaurant on the Boulevard du 20 Mai, popular for a calm sit-down meal."),
  dict(name="Le Moulin de France", category="restaurant", neighborhood="Centre-ville", address="Bd du 20 mai, Yaoundé", lat=3.862443, lng=11.5195599, rating=3.8, rating_count=1534, price_level=3, phone="+237 2 42 01 58 90", tags=["restaurant","fancy","bakery","french"], description="Well-known French bakery-restaurant chain with fresh pastries and a cozy upstairs lounge."),
  dict(name="La Cantine", category="restaurant", neighborhood="Hippodrome", address="2ème rue Hippodrome, Yaoundé", lat=3.8710508, lng=11.5199738, rating=4.3, rating_count=178, price_level=2, phone="+237 6 55 55 51 55", tags=["restaurant","bar","casual","live-events"], description="Relaxed Hippodrome restaurant-bar with a backyard screen for sports and a foosball table."),
  dict(name="La Terrasse", category="restaurant", neighborhood="Hippodrome", address="1147 Rue De Narvik, Yaoundé", lat=3.8692065, lng=11.5200409, rating=3.8, rating_count=175, price_level=2, phone="+237 6 74 88 27 03", tags=["restaurant","casual","quiet"], description="Quiet, greenery-filled restaurant in Hippodrome known for classic music and a calm ambiance."),
  dict(name="Blue Nile", category="restaurant", neighborhood="Hippodrome", address="967, Yaoundé", lat=3.8693724, lng=11.5205507, rating=4.3, rating_count=65, price_level=2, phone="+237 6 58 78 78 31", tags=["restaurant","casual","business-lunch"], description="Serene Hippodrome restaurant with a wide menu, popular for business lunches."),
  dict(name="Restaurant Le Carnivore", category="restaurant", neighborhood="Hippodrome", address="Yaoundé (by Drinks Center)", lat=3.8685191, lng=11.5212568, rating=4.2, rating_count=135, price_level=2, phone="+237 6 70 43 33 31", tags=["restaurant","grill","wine"], description="Beef-focused grill house in Hippodrome with an extensive wine list and live singers some evenings."),
  dict(name="Bar Restaurant la Cachette d'Essos", category="restaurant", neighborhood="Essos", address="Essos, derrière Hôtel de l'Avenir, Yaoundé", lat=3.8753815, lng=11.5484934, rating=3.9, rating_count=9, price_level=2, phone="+237 6 99 95 59 42", tags=["restaurant","casual","hidden-gem"], description="Discreet neighborhood restaurant in Essos with a loyal local following."),
  dict(name="LE RHUMSIKI", category="restaurant", neighborhood="Olembe", address="Rue Salomon Olembe, Yaoundé", lat=3.8746853, lng=11.539245, rating=4.2, rating_count=20, price_level=2, phone="+237 6 91 51 20 44", tags=["restaurant","local-cuisine","live-music"], description="Local Cameroonian restaurant near Olembe featuring traditional balafon music."),
  dict(name="CRUSH", category="restaurant", neighborhood="Bastos", address="Casino Bastos, Yaoundé", lat=3.88783, lng=11.5162267, rating=4.2, rating_count=28, price_level=2, phone="+237 6 97 87 02 61", tags=["restaurant","casual","affordable"], description="Small, well-liked Bastos restaurant known for good value and tasty dishes."),
  dict(name="O'mba'p Lounge", category="restaurant", neighborhood="Bastos", address="Mini Prix Bastos, Yaoundé", lat=3.8927458, lng=11.5190716, rating=4.6, rating_count=8, price_level=2, phone="+237 6 86 86 86 30", tags=["restaurant","fancy","lounge"], description="Chic Bastos lounge-restaurant with attentive service, a favorite for evening get-togethers."),
  dict(name="KAIS Lounge", category="restaurant", neighborhood="Nlongkak", address="Face Eneo Nlongkak, Yaoundé", lat=3.8858264, lng=11.5175028, rating=4.5, rating_count=55, price_level=2, phone="+237 6 20 22 38 26", tags=["restaurant","fancy","lounge","events"], description="Popular Nlongkak lounge for lunch, dinner, and celebrations, with a lively weekend crowd."),

  # -------- SPORTS --------
  dict(name="Yaounde Multipurpose Sports Complex", category="sports", neighborhood="Warda", address="Carrefour Warda, Yaoundé", lat=3.8742207, lng=11.5120756, rating=3.9, rating_count=2492, price_level=None, phone="+237 2 22 20 72 72", tags=["sports","stadium","table-tennis","events"], description="Large multi-sport venue hosting table tennis, athletics, and community sporting events."),
  dict(name="Complexe Fit For All", category="sports", neighborhood="Odza", address="Odza Borne 10, Yaoundé", lat=3.7901024, lng=11.524567, rating=5.0, rating_count=142, price_level=None, phone="+237 6 97 06 57 92", tags=["sports","gym","fitness"], description="Highly-rated Odza fitness center offering a full range of workout equipment and classes."),
  dict(name="Complexe Sportif La Fusion des Champions", category="sports", neighborhood="Etoa-Meki", address="Yaoundé", lat=3.8369955, lng=11.4748238, rating=4.0, rating_count=21, price_level=None, phone="+237 6 58 67 41 19", tags=["sports","gym","coaching"], description="Fitness complex with on-site coaches for strength training and general fitness goals."),
  dict(name="Complexe Immo_Fitness_Club", category="sports", neighborhood="Ngousso", address="Ngousso, Yaoundé", lat=3.9064189, lng=11.5393639, rating=4.2, rating_count=63, price_level=None, phone="+237 6 98 76 40 72", tags=["sports","gym","lodging"], description="Well-equipped Ngousso gym paired with an apartment complex."),
  dict(name="Complexe Fusion Fitness Club", category="sports", neighborhood="Etoa-Meki", address="Yaoundé", lat=3.8371597, lng=11.4823928, rating=4.0, rating_count=142, price_level=None, phone="+237 6 94 05 35 57", tags=["sports","gym","dance","barbershop"], description="Multipurpose sports club offering fitness, judo, and dance classes, plus an on-site barbershop."),
  dict(name="Complexe Sportif FMA", category="sports", neighborhood="Etoa-Meki", address="Yaoundé", lat=3.8296009, lng=11.4809478, rating=3.9, rating_count=22, price_level=None, phone="+237 2 22 31 40 23", tags=["sports","gym","quiet"], description="Quiet, focused gym space good for uninterrupted training sessions."),

  # -------- SPA / RELAXATION --------
  dict(name="Wellnessspa", category="spa", neighborhood="Ngousso", address="Face hôpital général, Ngousso, Yaoundé", lat=3.9075616, lng=11.5423286, rating=4.0, rating_count=2, price_level=None, phone="+237 6 20 71 36 17", tags=["spa","relaxation","beauty"], description="Small neighborhood beauty and wellness spa near Ngousso general hospital."),
  dict(name="Shu Anta Nlongkak", category="spa", neighborhood="Nlongkak", address="Rond point Nlongkak, Yaoundé", lat=3.8848691, lng=11.5191044, rating=4.2, rating_count=93, price_level=None, phone="+237 6 99 19 55 46", tags=["spa","relaxation","massage","affordable"], description="Popular Nlongkak spa offering massages, hammam, and body treatments at accessible prices."),
  dict(name="O'CHIC BEAUTY & SPA", category="spa", neighborhood="Bastos", address="Rue 1798, Bastos, Yaoundé", lat=3.892316, lng=11.5069816, rating=5.0, rating_count=8, price_level=None, phone="+237 6 87 82 15 52", tags=["spa","fancy","hair-salon","relaxation"], description="Elegant Bastos beauty salon and spa with top-rated hair and wellness services."),
  dict(name="Institut Le nid doux spa et Bien-être", category="spa", neighborhood="Mvan", address="Yaoundé", lat=3.8685006, lng=11.5603384, rating=5.0, rating_count=1, price_level=None, phone="+237 6 59 62 26 28", tags=["spa","relaxation"], description="Neighborhood wellness institute offering spa and beauty treatments in Mvan."),
  dict(name="Saiilama Academy Spa", category="spa", neighborhood="Elig-Essono", address="Yaoundé", lat=3.8798482, lng=11.5245512, rating=4.5, rating_count=32, price_level=3, phone="+237 6 99 91 30 30", tags=["spa","fancy","luxury","relaxation"], description="Upscale, appointment-only spa with premium natural products, open to men and women."),
  dict(name="Relax Space", category="spa", neighborhood="Bastos", address="Yaoundé", lat=3.8914882, lng=11.5171278, rating=3.0, rating_count=2, price_level=None, phone="+237 6 97 69 26 64", tags=["spa","affordable","hair"], description="Small Bastos-area salon offering massage and basic beauty services."),

  # -------- NIGHTLIFE --------
  dict(name="Bambou Lounge", category="nightlife", neighborhood="Hippodrome", address="Rue Frederic Foe, Hippodrome, Yaoundé", lat=3.8766493, lng=11.5181001, rating=4.1, rating_count=273, price_level=2, phone="+237 6 76 61 57 19", tags=["nightlife","club","dancing"], description="Spacious Hippodrome nightclub known for open-air events and DJ sets."),
  dict(name="Sanza Night Club", category="nightlife", neighborhood="Elig-Essono", address="Yaoundé", lat=3.8735041, lng=11.5261739, rating=3.8, rating_count=801, price_level=2, phone="+237 6 97 25 46 00", tags=["nightlife","club","fancy","live-music"], description="One of Yaoundé's best-known nightclubs, with a piano bar and grilled snacks outside."),
  dict(name="Duchess Lounge", category="nightlife", neighborhood="Biyem-Assi", address="Monte Jouvance, Biyem-Assi, Yaoundé", lat=3.8299092, lng=11.478077, rating=3.8, rating_count=211, price_level=2, phone="+237 6 61 10 88 70", tags=["nightlife","lounge","restaurant"], description="Biyem-Assi lounge with a resident DJ, restaurant menu, and secured parking."),
  dict(name="Wave Night Club", category="nightlife", neighborhood="Centre-ville", address="Yaoundé", lat=3.8710721, lng=11.5153041, rating=4.1, rating_count=26, price_level=None, phone="+237 6 99 13 74 93", tags=["nightlife","club"], description="Late-night club in the city center, busiest after 2am."),
  dict(name="XO NIGHT CLUB", category="nightlife", neighborhood="Centre-ville", address="Yaoundé", lat=3.8713086, lng=11.5156579, rating=4.1, rating_count=87, price_level=None, phone="+237 6 96 45 80 10", tags=["nightlife","club","fancy"], description="Well-managed city-center nightclub known for good security and service."),
  dict(name="The Rooftop Yaoundé", category="nightlife", neighborhood="Nlongkak", address="Rue Joseph Mballa Eloumden, Yaoundé", lat=3.8818176, lng=11.5234381, rating=4.1, rating_count=314, price_level=2, phone="+237 6 99 78 27 67", tags=["nightlife","fancy","rooftop","views"], description="Rooftop bar and restaurant with panoramic city views, popular for evening drinks."),

  # -------- HOTELS --------
  dict(name="Hilton Yaounde", category="hotel", neighborhood="Centre-ville", address="Bd du 20 mai, Yaoundé", lat=3.8649635, lng=11.516126, rating=4.2, rating_count=5127, price_level=3, phone="+237 6 50 56 55 96", tags=["hotel","fancy","luxury","central"], description="Yaoundé's landmark international hotel, centrally located with multiple restaurants and a rooftop bar."),
  dict(name="Hôtel Suzanne Nel.C Lounge", category="hotel", neighborhood="Odza", address="Odza - Messamedongo, Yaoundé", lat=3.7979922, lng=11.5231292, rating=4.6, rating_count=16, price_level=None, phone="+237 6 57 22 65 35", tags=["hotel","affordable","clean"], description="Small, highly-rated Odza hotel known for cleanliness and a warm welcome."),
  dict(name="Riad Prince Louis", category="hotel", neighborhood="Centre-ville", address="Yaoundé", lat=3.8639428, lng=11.5254823, rating=4.4, rating_count=18, price_level=3, phone="+237 6 72 75 03 32", tags=["hotel","fancy","garden","quiet"], description="Boutique riad-style guesthouse in the city center with a calming garden setting."),
  dict(name="La Falaise Hotel", category="hotel", neighborhood="Centre-ville", address="Ave Merechal Foch, Yaoundé", lat=3.8702705, lng=11.515506, rating=4.0, rating_count=1975, price_level=2, phone="+237 2 22 22 06 16", tags=["hotel","central","gym","pool"], description="Well-known central hotel with a gym, pool, restaurant, and event hall."),
  dict(name="larochelle hôtel Yaoundé", category="hotel", neighborhood="Mimboman", address="Mimboman Terminus, Yaoundé", lat=3.866619, lng=11.5510535, rating=4.0, rating_count=91, price_level=None, phone="+237 6 52 21 11 11", tags=["hotel","affordable"], description="Comfortable, accessible hotel in Mimboman with a range of food options."),
  dict(name="STAR LAND HOTEL BASTOS", category="hotel", neighborhood="Bastos", address="Avenue Ambassade d'Espagne, Yaoundé", lat=3.8939979, lng=11.5133182, rating=4.3, rating_count=685, price_level=3, phone="+237 6 71 00 08 88", tags=["hotel","fancy","modern"], description="Modern upscale hotel in Bastos, popular for its restaurant and central location."),
  dict(name="Djeuga Palace", category="hotel", neighborhood="Hippodrome", address="1 Avenue Narvick, Yaoundé", lat=3.8713357, lng=11.5157065, rating=3.9, rating_count=2038, price_level=3, phone="+237 6 50 16 39 79", tags=["hotel","fancy","nightclub","central"], description="Four-star city-center hotel near Yaoundé Central Market, with a basement nightclub and casino."),

  # -------- ATTRACTIONS / RELAXATION (outdoors) --------
  dict(name="Eco Park", category="attraction", neighborhood="Nkolbisson", address="Yaoundé", lat=3.7867188, lng=11.4879595, rating=3.8, rating_count=917, price_level=None, phone="+237 6 94 87 20 43", tags=["attraction","relaxation","zoo","outdoor"], description="Green eco-tourism park with a small zoo, museum, and restaurant setting."),
  dict(name="NATURO PARC", category="attraction", neighborhood="Nsimalen", address="Near Nsimalen Airport, Yaoundé", lat=3.7264392, lng=11.5278329, rating=4.4, rating_count=13, price_level=None, phone="+237 6 92 79 06 57", tags=["attraction","relaxation","pool","hiking","outdoor"], description="Floral park near the airport offering woodland walks, a pool, gym, and picnic spots."),
  dict(name="I Love My Country Cameroon Round About", category="attraction", neighborhood="Centre-ville", address="Yaoundé", lat=3.8661674, lng=11.5153, rating=4.1, rating_count=129, price_level=None, phone=None, tags=["attraction","monument","photos"], description="A striking sculptural monument in the city center, popular for photos in the evening."),
  dict(name="Municipal Lake", category="attraction", neighborhood="Centre-ville", address="Yaoundé", lat=3.865962, lng=11.510582, rating=3.4, rating_count=383, price_level=None, phone="+46 76755188", tags=["attraction","relaxation","outdoor","free"], description="One of the city's only green lakeside spaces, free to enter and popular at sunset."),
  dict(name="Village Madiba", category="attraction", neighborhood="Soa", address="Carrefour Tsinga, Soa, Yaoundé", lat=3.9460212, lng=11.5676245, rating=4.2, rating_count=33, price_level=None, phone="+237 6 99 91 26 23", tags=["attraction","relaxation","nature","fishing","outdoor"], description="Peaceful nature retreat near Soa dedicated to Mandela, with fishing and picnic areas."),
  dict(name="Lions International Place", category="attraction", neighborhood="Centre-ville", address="Yaoundé", lat=3.8582936, lng=11.5194416, rating=3.5, rating_count=64, price_level=None, phone="+237 6 70 37 33 47", tags=["attraction","park","relaxation","free"], description="Small public park in the city center, a quiet spot for a short break."),
  dict(name="PlaYce Yaoundé", category="attraction", neighborhood="Warda", address="Warda, Yaoundé", lat=3.8743774, lng=11.5123432, rating=4.4, rating_count=1825, price_level=2, phone=None, tags=["attraction","shopping","family-friendly","indoor"], description="Yaoundé's modern shopping mall in Warda, with a supermarket, boutiques, an arcade, and a kids' playground."),

  # -------- ENTERTAINMENT --------
  dict(name="Canal Olympia (Majestic Cinema)", category="entertainment", neighborhood="Ngoa-Ekelle", address="Université de Yaoundé I, Yaoundé", lat=3.8593788, lng=11.4964449, rating=4.1, rating_count=1854, price_level=2, phone="+237 6 90 20 20 20", tags=["entertainment","cinema","family-friendly"], description="Yaoundé's main modern cinema, on the University of Yaoundé I campus, with food stalls around the entrance."),

  # -------- LANDMARK --------
  dict(name="La Cathédrale (Notre-Dame des Victoires)", category="landmark", neighborhood="Centre-ville", address="Cathédrale de Yaoundé, Poste Centrale, Yaoundé", lat=3.8632006, lng=11.5210148, rating=4.1, rating_count=39, price_level=None, phone=None, tags=["landmark","church","history","photos"], description="Yaoundé's landmark cathedral at Poste Centrale, known for its cross-shaped architecture and stained glass."),
<<<<<<< HEAD
=======
  
  # -------- NEW CATEGORIES --------
  # Hospitals (8)
  dict(name="Hôpital Central de Yaoundé", category="hospital", neighborhood="Centre-ville", address="Rue Henri Dunant, Yaoundé", lat=3.8650, lng=11.5230, rating=3.5, rating_count=450, price_level=None, phone="+237 2 22 23 40 20", tags=["hospital", "medical", "central"], description="Major central public hospital in Yaoundé."),
  dict(name="Hôpital Général de Yaoundé", category="hospital", neighborhood="Ngousso", address="Ngousso, Yaoundé", lat=3.9070, lng=11.5420, rating=3.8, rating_count=320, price_level=None, phone="+237 2 22 20 28 02", tags=["hospital", "medical"], description="Large general hospital in the Ngousso neighborhood."),
  dict(name="CHU de Yaoundé", category="hospital", neighborhood="Ngoa-Ekelle", address="Ngoa-Ekelle, Yaoundé", lat=3.8560, lng=11.4970, rating=3.6, rating_count=210, price_level=None, phone="+237 2 22 31 25 36", tags=["hospital", "medical", "university"], description="University teaching hospital located near the University of Yaoundé I."),
  dict(name="Clinique de la Cathédrale", category="hospital", neighborhood="Centre-ville", address="Centre-ville, Yaoundé", lat=3.8635, lng=11.5220, rating=4.1, rating_count=85, price_level=None, phone="+237 2 22 22 15 15", tags=["hospital", "clinic", "private"], description="Private clinic located near the central cathedral."),
  dict(name="Hôpital Gynéco-Obstétrique et Pédiatrique de Yaoundé", category="hospital", neighborhood="Ngousso", address="Ngousso, Yaoundé", lat=3.9080, lng=11.5450, rating=3.9, rating_count=190, price_level=None, phone="+237 2 22 21 24 31", tags=["hospital", "medical", "pediatrics"], description="Specialized hospital for gynecology, obstetrics, and pediatrics."),
  dict(name="Centre Hospitalier d'Essos", category="hospital", neighborhood="Essos", address="Essos, Yaoundé", lat=3.8750, lng=11.5450, rating=3.4, rating_count=145, price_level=None, phone="+237 2 22 22 23 23", tags=["hospital", "medical"], description="Community hospital serving the Essos district."),
  dict(name="Hôpital de la Caisse", category="hospital", neighborhood="Centre-ville", address="Centre-ville, Yaoundé", lat=3.8640, lng=11.5240, rating=3.7, rating_count=260, price_level=None, phone="+237 2 22 23 11 12", tags=["hospital", "medical"], description="Well-known medical facility operated by CNPS."),
  dict(name="Polyclinique Internationale Bastos", category="hospital", neighborhood="Bastos", address="Bastos, Yaoundé", lat=3.8920, lng=11.5160, rating=4.3, rating_count=110, price_level=None, phone="+237 2 22 21 22 22", tags=["hospital", "clinic", "private"], description="Upscale private clinic in the diplomatic neighborhood of Bastos."),

  # Schools (10)
  dict(name="Université de Yaoundé I", category="school", neighborhood="Ngoa-Ekelle", address="Ngoa-Ekelle, Yaoundé", lat=3.8580, lng=11.4960, rating=4.2, rating_count=850, price_level=None, phone="+237 2 22 22 07 44", tags=["school", "university", "education"], description="The oldest and largest university in Cameroon."),
  dict(name="Université de Yaoundé II", category="school", neighborhood="Soa", address="Soa, Yaoundé", lat=3.9500, lng=11.5900, rating=4.0, rating_count=420, price_level=None, phone="+237 2 22 23 20 20", tags=["school", "university", "education"], description="Major public university campus located in the suburb of Soa."),
  dict(name="Lycée Général Leclerc", category="school", neighborhood="Centre-ville", address="Centre-ville, Yaoundé", lat=3.8660, lng=11.5170, rating=4.1, rating_count=310, price_level=None, phone="+237 2 22 22 10 10", tags=["school", "high-school", "education"], description="Historic high school located in the center of Yaoundé."),
  dict(name="Lycée Bilingue d'Application", category="school", neighborhood="Hippodrome", address="Hippodrome, Yaoundé", lat=3.8750, lng=11.5160, rating=4.3, rating_count=215, price_level=None, phone="+237 2 22 22 13 13", tags=["school", "high-school", "bilingual"], description="Prominent bilingual high school in the Hippodrome area."),
  dict(name="Collège Vogt", category="school", neighborhood="Mvolye", address="Mvolye, Yaoundé", lat=3.8430, lng=11.4880, rating=4.6, rating_count=280, price_level=None, phone="+237 2 22 31 15 15", tags=["school", "college", "private"], description="Highly regarded private Catholic secondary school."),
  dict(name="École Nationale Supérieure Polytechnique", category="school", neighborhood="Ngoa-Ekelle", address="Ngoa-Ekelle, Yaoundé", lat=3.8550, lng=11.4950, rating=4.5, rating_count=190, price_level=None, phone="+237 2 22 22 16 16", tags=["school", "engineering", "university"], description="Top engineering school in Cameroon, part of UY1."),
  dict(name="Institut Africain d'Informatique", category="school", neighborhood="Nlongkak", address="Nlongkak, Yaoundé", lat=3.8820, lng=11.5240, rating=4.0, rating_count=140, price_level=None, phone="+237 2 22 20 18 18", tags=["school", "informatics", "higher-education"], description="Interstate higher education institution for computer science."),
  dict(name="ESSTIC", category="school", neighborhood="Ngoa-Ekelle", address="Ngoa-Ekelle, Yaoundé", lat=3.8570, lng=11.4980, rating=4.3, rating_count=165, price_level=None, phone="+237 2 22 22 19 19", tags=["school", "journalism", "communication"], description="Leading school of journalism and mass communication in Central Africa."),
  dict(name="Institut Universitaire de la Côte (Bastos)", category="school", neighborhood="Bastos", address="Bastos, Yaoundé", lat=3.8940, lng=11.5150, rating=3.9, rating_count=90, price_level=None, phone="+237 2 22 21 21 21", tags=["school", "institute", "private"], description="Yaoundé campus of the prominent higher education institute."),
  dict(name="Lycée de Nkol-Eton", category="school", neighborhood="Nkol-Eton", address="Nkol-Eton, Yaoundé", lat=3.8850, lng=11.5280, rating=3.8, rating_count=130, price_level=None, phone="+237 2 22 22 25 25", tags=["school", "high-school", "education"], description="Well-known public high school situated in Nkol-Eton."),

  # Lakes (6)
  dict(name="Lac Municipal de Yaoundé (Lac)", category="lake", neighborhood="Centre-ville", address="Centre-ville, Yaoundé", lat=3.8659, lng=11.5105, rating=3.5, rating_count=400, price_level=None, phone=None, tags=["lake", "water", "ecology"], description="Central lake vital to Yaoundé's urban ecology, serving as a green lung for the city."),
  dict(name="Lac de Mefou", category="lake", neighborhood="Mefou", address="Mefou, Yaoundé", lat=3.7500, lng=11.4500, rating=4.2, rating_count=120, price_level=None, phone=None, tags=["lake", "water", "nature"], description="Beautiful lake in the southern outskirts known for surrounding wildlife."),
  dict(name="Lac d'Obili", category="lake", neighborhood="Obili", address="Obili, Yaoundé", lat=3.8520, lng=11.4900, rating=3.2, rating_count=85, price_level=None, phone=None, tags=["lake", "water", "urban"], description="Small urban lake located near the university district of Obili."),
  dict(name="Lac de Simbi", category="lake", neighborhood="Nkolbisson", address="Nkolbisson, Yaoundé", lat=3.8750, lng=11.4500, rating=3.7, rating_count=45, price_level=None, phone=None, tags=["lake", "water", "scenic"], description="Scenic water body situated in the western suburb of Nkolbisson."),
  dict(name="Retenue d'eau de la Mefou", category="lake", neighborhood="Mvan", address="Mvan, Yaoundé", lat=3.8150, lng=11.5050, rating=3.8, rating_count=60, price_level=None, phone=None, tags=["lake", "reservoir", "water"], description="Reservoir area providing important water resources and a tranquil environment."),
  dict(name="Lac d'Atemengue", category="lake", neighborhood="Atemengue", address="Atemengue, Yaoundé", lat=3.8580, lng=11.5050, rating=3.4, rating_count=70, price_level=None, phone=None, tags=["lake", "water", "quiet"], description="Quiet lakeside area in the Atemengue quarter."),

  # Worship (6)
  dict(name="Basilique Marie-Reine des Apôtres de Mvolye", category="worship", neighborhood="Mvolye", address="Mvolye, Yaoundé", lat=3.8410, lng=11.4850, rating=4.7, rating_count=650, price_level=None, phone="+237 2 22 31 11 11", tags=["worship", "basilica", "catholic"], description="Stunning Marian basilica built on the site of the first Catholic mission in Yaoundé."),
  dict(name="Mosquée Centrale de Yaoundé", category="worship", neighborhood="Briqueterie", address="Briqueterie, Yaoundé", lat=3.8720, lng=11.5120, rating=4.5, rating_count=410, price_level=None, phone=None, tags=["worship", "mosque", "islam"], description="The grand central mosque serving Yaoundé's Muslim community, located in Briqueterie."),
  dict(name="Cathédrale Notre-Dame des Victoires (Worship)", category="worship", neighborhood="Centre-ville", address="Centre-ville, Yaoundé", lat=3.8632, lng=11.5210, rating=4.6, rating_count=520, price_level=None, phone="+237 2 22 22 22 22", tags=["worship", "cathedral", "catholic"], description="The seat of the Archdiocese of Yaoundé, offering massive striking architecture and daily mass."),
  dict(name="Église Presbytérienne du Cameroun Mokolo", category="worship", neighborhood="Mokolo", address="Mokolo, Yaoundé", lat=3.8730, lng=11.5050, rating=4.2, rating_count=180, price_level=None, phone=None, tags=["worship", "church", "presbyterian"], description="Major Presbyterian church located near the bustling Mokolo market."),
  dict(name="Temple de Djoungolo", category="worship", neighborhood="Djoungolo", address="Djoungolo, Yaoundé", lat=3.8800, lng=11.5300, rating=4.3, rating_count=140, price_level=None, phone=None, tags=["worship", "church", "protestant"], description="Historic Protestant temple serving the Djoungolo community."),
  dict(name="Chapelle du Mont Fébé", category="worship", neighborhood="Mont Fébé", address="Mont Fébé, Yaoundé", lat=3.8960, lng=11.4860, rating=4.8, rating_count=210, price_level=None, phone=None, tags=["worship", "chapel", "scenic"], description="A beautiful, serene chapel on Mont Fébé offering panoramic views of the city."),

  # Market (5)
  dict(name="Marché Central de Yaoundé", category="market", neighborhood="Centre-ville", address="Centre-ville, Yaoundé", lat=3.8690, lng=11.5210, rating=4.0, rating_count=1150, price_level=1, phone=None, tags=["market", "shopping", "central"], description="The sprawling main market of Yaoundé, selling everything from clothes to fresh produce."),
  dict(name="Marché Mokolo", category="market", neighborhood="Mokolo", address="Mokolo, Yaoundé", lat=3.8740, lng=11.5060, rating=3.9, rating_count=1300, price_level=1, phone=None, tags=["market", "shopping", "busy"], description="Yaoundé's largest and most bustling open-air market, famous for affordable goods."),
  dict(name="Marché du Mfoundi", category="market", neighborhood="Centre-ville", address="Centre-ville, Yaoundé", lat=3.8620, lng=11.5250, rating=4.1, rating_count=820, price_level=1, phone=None, tags=["market", "food", "produce"], description="Major fresh food and produce market in the heart of the city."),
  dict(name="Marché de Mvog-Mbi", category="market", neighborhood="Mvog-Mbi", address="Mvog-Mbi, Yaoundé", lat=3.8500, lng=11.5200, rating=3.8, rating_count=410, price_level=1, phone=None, tags=["market", "shopping", "local"], description="Vibrant local market known for traditional ingredients and daily necessities."),
  dict(name="Marché de Madagascar", category="market", neighborhood="Madagascar", address="Madagascar, Yaoundé", lat=3.8800, lng=11.4900, rating=3.7, rating_count=350, price_level=1, phone=None, tags=["market", "shopping", "local"], description="Neighborhood market offering a wide array of local foods and household items."),

  # Government (5)
  dict(name="Palais de l'Unité", category="government", neighborhood="Etoudi", address="Etoudi, Yaoundé", lat=3.8930, lng=11.5040, rating=4.4, rating_count=450, price_level=None, phone=None, tags=["government", "palace", "presidential"], description="The magnificent Presidential Palace of Cameroon, set in lush grounds in Etoudi."),
  dict(name="Assemblée Nationale du Cameroun", category="government", neighborhood="Ngoa-Ekelle", address="Ngoa-Ekelle, Yaoundé", lat=3.8570, lng=11.5020, rating=4.1, rating_count=210, price_level=None, phone=None, tags=["government", "parliament", "building"], description="The seat of the lower house of the Cameroonian Parliament."),
  dict(name="Musée National du Cameroun", category="government", neighborhood="Centre-ville", address="Quartier Administratif, Yaoundé", lat=3.8670, lng=11.5200, rating=4.5, rating_count=680, price_level=1, phone="+237 2 22 22 22 22", tags=["government", "museum", "culture"], description="Former presidential palace now housing extensive exhibits on Cameroon's cultural heritage."),
  dict(name="CRTV", category="government", neighborhood="Mballa II", address="Mballa II, Yaoundé", lat=3.8850, lng=11.5200, rating=3.9, rating_count=320, price_level=None, phone="+237 2 22 21 40 40", tags=["government", "media", "broadcasting"], description="Headquarters of the Cameroon Radio Television national broadcasting network."),
  dict(name="Poste Centrale de Yaoundé", category="government", neighborhood="Centre-ville", address="Place de la Poste, Yaoundé", lat=3.8640, lng=11.5210, rating=4.0, rating_count=510, price_level=None, phone="+237 2 22 23 23 23", tags=["government", "post-office", "landmark"], description="The central post office building, a major landmark and meeting point in the city center."),

  # Nature (5)
  dict(name="Mont Fébé", category="nature", neighborhood="Mont Fébé", address="Mont Fébé, Yaoundé", lat=3.8950, lng=11.4850, rating=4.6, rating_count=890, price_level=None, phone=None, tags=["nature", "hiking", "views"], description="One of Yaoundé's famous seven hills, offering hiking trails and stunning city vistas."),
  dict(name="Bois Sainte Anastasie", category="nature", neighborhood="Centre-ville", address="Carrefour Warda, Yaoundé", lat=3.8640, lng=11.5110, rating=4.2, rating_count=750, price_level=None, phone=None, tags=["nature", "park", "relaxation"], description="A tranquil green oasis in the city center with paved walking paths and a restaurant."),
  dict(name="Jardin Botanique", category="nature", neighborhood="Ngoa-Ekelle", address="Ngoa-Ekelle, Yaoundé", lat=3.8560, lng=11.4980, rating=4.0, rating_count=340, price_level=None, phone=None, tags=["nature", "botanical", "park"], description="Botanical garden offering a quiet escape and a variety of tropical plant species."),
  dict(name="Parc Zoologique de Mvog-Betsi", category="nature", neighborhood="Mvog-Betsi", address="Mvog-Betsi, Yaoundé", lat=3.8450, lng=11.4900, rating=3.8, rating_count=620, price_level=1, phone="+237 2 22 31 11 12", tags=["nature", "zoo", "wildlife"], description="Yaoundé's main zoo and botanical park, housing primates, big cats, and reptiles."),
  dict(name="Colline de Nkolondom", category="nature", neighborhood="Nkolondom", address="Nkolondom, Yaoundé", lat=3.9200, lng=11.4800, rating=4.4, rating_count=180, price_level=None, phone=None, tags=["nature", "hill", "hiking"], description="A prominent hill on the northern edge of the city, great for hiking and nature walks."),

  # Transport (5)
  dict(name="Gare Routière de Mvan", category="transport", neighborhood="Mvan", address="Mvan, Yaoundé", lat=3.8200, lng=11.5000, rating=3.4, rating_count=1200, price_level=None, phone=None, tags=["transport", "bus", "station"], description="Major southern bus terminal for travel toward Douala and the southern regions."),
  dict(name="Aéroport International de Yaoundé-Nsimalen", category="transport", neighborhood="Nsimalen", address="Nsimalen, Yaoundé", lat=3.7220, lng=11.5530, rating=4.0, rating_count=1500, price_level=None, phone="+237 2 22 23 36 02", tags=["transport", "airport", "international"], description="The main international airport serving Yaoundé, located about 20km south of the city."),
  dict(name="Gare Routière de Tongolo", category="transport", neighborhood="Nsam", address="Tongolo, Yaoundé", lat=3.8900, lng=11.5200, rating=3.5, rating_count=450, price_level=None, phone=None, tags=["transport", "bus", "station"], description="Key northern bus terminal for travel to the West and North-West regions."),
  dict(name="Gare Ferroviaire de Yaoundé", category="transport", neighborhood="Centre-ville", address="Place de la Gare, Yaoundé", lat=3.8690, lng=11.5240, rating=3.8, rating_count=780, price_level=None, phone="+237 2 22 23 10 10", tags=["transport", "train", "station"], description="The central railway station providing passenger services to Douala and Ngaoundéré."),
  dict(name="Gare Routière de Biyem-Assi", category="transport", neighborhood="Biyem-Assi", address="Biyem-Assi, Yaoundé", lat=3.8300, lng=11.4800, rating=3.3, rating_count=320, price_level=None, phone=None, tags=["transport", "bus", "station"], description="Local and regional bus hub serving the bustling Biyem-Assi neighborhood."),
>>>>>>> local-backup
]

CATEGORY_KEYWORDS = {
    'restaurant': 'restaurant,dining', 'sports': 'gym,fitness', 'spa': 'spa,massage',
    'nightlife': 'nightclub,bar', 'hotel': 'hotel,lobby', 'attraction': 'park,outdoor',
    'entertainment': 'cinema,movietheater', 'landmark': 'cathedral,church',
<<<<<<< HEAD
=======
    'hospital': 'hospital,medical', 'school': 'school,university', 'lake': 'lake,water',
    'worship': 'church,mosque', 'market': 'market,shopping', 'government': 'government,building',
    'nature': 'nature,hiking', 'transport': 'bus,station',
>>>>>>> local-backup
}

local_count = 0
for i, p in enumerate(places, start=1):
    p["id"] = i
    local_image = find_local_image(i)
    if local_image:
        p["image_url"] = local_image
        local_count += 1
    else:
        kw = CATEGORY_KEYWORDS.get(p["category"], "travel")
        p["image_url"] = f"https://loremflickr.com/640/420/{kw}?lock={i}"

import database
from models import Destination

database.init_db()
with database.get_session() as session:
    for p in places:
        existing = session.get(Destination, p["id"])
        if existing:
            for key, value in p.items():
                setattr(existing, key, value)
        else:
            session.add(Destination(**p))

print(f"Seeded {len(places)} places into the database ({database.DATABASE_URL}).")
print(f"  {local_count} using your local photos, {len(places) - local_count} using placeholders")

# Cameroon Fare Research

Research checked on 2026-09-11. These are planning references, not a transport-booking service or certification of current legal tariffs. No recurring scraper or third-party pricing API is installed.

## Shared Urban Taxi

[StopBlaBlaCam, 27 February 2024](https://www.stopblablacam.com/societe/2702-11991-transport-urbain-le-tarif-du-taxi-passe-officiellement-de-300-a-350-fcfa) reports the MINCOMMERCE order signed on 26 February 2024: urban shared pickup 350 FCFA by day and 400 FCFA at night from 22:00; negotiated fares remain possible and the amounts are described as ceilings. Reduced-rate exceptions for pupils, students and people with reduced mobility are mentioned but not quantified by this source.

The app shows 350-400 FCFA as the span of these published day/night ceilings per passenger, NOT as a guaranteed range for the selected route and NOT as a distance-based tariff. It flags this source as more than a year old. We have not re-certified current legal applicability, later amendments, the night-to-day cutoff, or trip/zone exceptions. The report also gives private depot figures of 3000/3500 FCFA and an interurban bus figure of 16 FCFA/km; neither is applied to urban route estimates because they describe different services.

## Yaounde Distance Planning Range

[Numbeo taxi fare page for Yaounde](https://www.numbeo.com/taxi-fare/in/Yaounde-Cameroon) reports a taxi-start range of 350-500 FCFA and a kilometer range of 150-300 FCFA. The corresponding [city cost-of-living page](https://www.numbeo.com/cost-of-living/in/Yaounde-Cameroon) was last updated on 19 June 2026; that is a page-level date, not proof that each taxi observation was made then. Its 11 contributors/125 entries are for the city page as a whole, not a taxi-specific sample count.

The app combines the low endpoints and high endpoints for a conservative planning interval: `low = round(350 + road_km * 150)`, `high = round(500 + road_km * 300)`. For 1.2 km this is 530-860 FCFA. This constructed interval is not a statistical confidence interval. The source's generic standard-tariff fields do not establish that Yaounde taxis are metered or that a provider will accept these prices. The app labels it low confidence and per vehicle, excludes waiting/tolls/surge, and keeps it distinct from shared pickup references.

The [Numbeo terms](https://www.numbeo.com/common/terms_of_use.jsp) permit attributed academic/personal reuse; a source link is displayed in the app. This capstone uses a small dated factual excerpt for academic demonstration. Before commercial use or distribution as a data feed, obtain appropriate permission/licensing or replace/deactivate this policy with independently gathered, documented field observations. Do not add automatic scraping; the terms prohibit it without permission.

## Moto and Provider Quotes

[Yango Cameroon](https://yango.com/en_cm/) is linked as a provider entry point, not evidence of any universal price. No verified Yaounde-wide moto kilometer tariff was established. The moto policy therefore contains no numeric price and says "Quote required". Local restrictions, road access, availability and final prices must be confirmed with a provider. There is no Yango booking or live-price integration.

## Scope and Maintenance

Research is withheld unless both endpoints fall in the planning screen of longitude 11.35-11.70, latitude 3.70-4.05, and road distance is at most 50 km. This conservative technical screen is not an authoritative municipal boundary or legal eligibility rule. Long-distance/intercity journeys require independent quotes.

Administrators can change numeric bounds, source URL/name/type, dates, English/French notes, pricing model and publication state, with optimistic version checks and audit entries. Record observation dates honestly; changing `checked_at` means the source was consulted, not that prices were independently verified. Never convert a published flat ceiling into a kilometer rate without new evidence. Disabled policies remain disabled and do not silently fall back to defaults. User-entered custom estimates remain separate from researched data.
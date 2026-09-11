from copy import deepcopy
from datetime import date
import math
from urllib.parse import urlsplit

from database import get_session
from models import FarePolicy


DEFAULT_POLICIES = [
    {
        "id": "yaounde-shared", "city": "Yaounde", "mode": "taxi", "model": "reference", "basis": "passenger",
        "base_min": 350, "base_max": 400, "per_km_min": 0, "per_km_max": 0,
        "source_name": "StopBlaBlaCam / MINCOMMERCE report", "source_url": "https://www.stopblablacam.com/societe/2702-11991-transport-urbain-le-tarif-du-taxi-passe-officiellement-de-300-a-350-fcfa",
        "source_date": "2024-02-26", "checked_at": "2026-09-11", "source_type": "reported_tariff", "active": True,
        "notes_en": "Reported urban ceilings: 350 FCFA by day, 400 FCFA at night from 22:00. Negotiated fares and reduced-rate exceptions apply. Not a per-kilometer quote; current legal status has not been re-certified.",
        "notes_fr": "Plafonds urbains rapportes : 350 FCFA le jour, 400 FCFA la nuit des 22 h. Negociation et exceptions a tarif reduit. Ce n'est pas un prix au kilometre ; validite juridique actuelle non recertifiee.",
    },
    {
        "id": "yaounde-private", "city": "Yaounde", "mode": "private", "model": "distance", "basis": "vehicle",
        "base_min": 350, "base_max": 500, "per_km_min": 150, "per_km_max": 300,
        "source_name": "Numbeo (crowdsourced)", "source_url": "https://www.numbeo.com/taxi-fare/in/Yaounde-Cameroon",
        "source_date": "2026-06-19", "checked_at": "2026-09-11", "source_type": "crowdsourced", "active": True,
        "notes_en": "Low-confidence planning range from reported start and kilometer ranges. Not an official meter tariff or a provider quote. Excludes waiting, tolls and surge pricing. Academic-use attribution: Numbeo.",
        "notes_fr": "Fourchette indicative peu certaine, issue des montants de depart et par kilometre declares. Ni tarif officiel ni devis. Attente, peages et majorations exclus. Attribution pour usage academique : Numbeo.",
    },
    {
        "id": "yaounde-moto", "city": "Yaounde", "mode": "moto", "model": "quote", "basis": "passenger",
        "base_min": 0, "base_max": 0, "per_km_min": 0, "per_km_max": 0,
        "source_name": "Yango Cameroon", "source_url": "https://yango.com/en_cm/",
        "source_date": None, "checked_at": "2026-09-11", "source_type": "provider", "active": True,
        "notes_en": "No verified citywide moto rate. Ask a provider for a quote and confirm availability and local access restrictions. The provider page does not establish a universal tariff.",
        "notes_fr": "Aucun tarif moto verifie pour toute la ville. Demandez un devis et confirmez la disponibilite et les restrictions locales. La page du prestataire ne fixe pas de tarif universel.",
    },
]


def list_policies(include_inactive=False):
    policies = {policy["id"]: {**deepcopy(policy), "version": 0} for policy in DEFAULT_POLICIES}
    with get_session() as session:
        for row in session.query(FarePolicy).all():
            policies[row.id] = {**row.data, "id": row.id, "version": row.version}
    return [policy for policy in policies.values() if include_inactive or policy["active"]]


def validate_policy(policy):
    if not isinstance(policy, dict) or set(policy) != set(DEFAULT_POLICIES[0]):
        return "All fare policy fields are required."
    definition = next((item for item in DEFAULT_POLICIES if item["id"] == policy["id"]), None)
    if not definition or policy["city"] != definition["city"] or policy["mode"] != definition["mode"] or policy["model"] not in ("reference", "distance", "quote") or policy["basis"] not in ("passenger", "vehicle") or policy["source_type"] not in ("reported_tariff", "crowdsourced", "provider", "field_research") or type(policy["active"]) is not bool:
        return "Invalid fare policy scope or pricing basis."
    for field in ("base_min", "base_max", "per_km_min", "per_km_max"):
        value = policy[field]
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1000000:
            return "Fare amounts must be finite non-negative numbers."
    if policy["base_min"] > policy["base_max"] or policy["per_km_min"] > policy["per_km_max"]:
        return "The low fare must not exceed the high fare."
    if policy["model"] != "distance" and (policy["per_km_min"] or policy["per_km_max"]):
        return "Only distance estimates can have a per-kilometer rate."
    if policy["model"] == "quote" and (policy["base_min"] or policy["base_max"]):
        return "Quote-only modes cannot publish an amount."
    for field in ("source_name", "source_url", "notes_en", "notes_fr"):
        if not isinstance(policy[field], str) or not policy[field].strip() or len(policy[field]) > (1000 if field.startswith("notes") else 500):
            return "A source and notes in both languages are required."
    try:
        source = urlsplit(policy["source_url"])
    except ValueError:
        return "Use a valid HTTPS source URL."
    if source.scheme != "https" or not source.hostname or source.username or source.password:
        return "Use a valid HTTPS source URL."
    for field in ("source_date", "checked_at"):
        if policy[field] is None and field == "source_date":
            continue
        try:
            parsed = date.fromisoformat(policy[field])
            if parsed.isoformat() != policy[field] or parsed > date.today():
                raise ValueError()
        except (ValueError, TypeError):
            return "Source dates must be valid and not in the future."
    if policy["source_date"] and policy["source_date"] > policy["checked_at"]:
        return "Source dates must be valid and not in the future."
    return None
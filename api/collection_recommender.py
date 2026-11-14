import csv
import math
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent

COLLECTION_POINTS_PATH = (
    ROOT / "data/circularity/collection_points/collection_points.csv"
)
RECYCLING_PARTNERS_PATH = (
    ROOT / "data/circularity/partners/recycling_partners.csv"
)
EXTERNAL_RECYCLERS_PATH = (
    ROOT / "data/circularity/partners/external_recyclers.csv"
)

REQUIRED_FIELDS = {
    "collection_points": {
        "point_id", "name", "latitude", "longitude",
        "accepted_materials", "accepted_waste_conditions",
        "minimum_quantity_kg", "maximum_quantity_kg",
        "accepts_dropoff", "is_active", "capacity_kg",
        "current_load_kg", "access_type", "verification_status",
    },
    "recycling_partners": {
        "partner_id", "name", "latitude", "longitude",
        "accepted_materials", "accepted_waste_conditions",
        "minimum_quantity_kg", "maximum_quantity_kg",
        "accepts_dropoff", "is_active", "access_type",
        "verification_status", "partnership_status",
    },
    "external_recyclers": {
        "facility_id", "name", "latitude", "longitude",
        "accepted_materials", "accepted_waste_conditions",
        "minimum_quantity_kg", "maximum_quantity_kg",
        "accepts_dropoff", "is_active", "access_type",
        "verification_status",
    },
}

MATERIAL_ALIASES = {
    "bottle": "plastic",
    "plastic bottle": "plastic",
    "pet": "plastic",
    "aluminium": "metal",
    "aluminum": "metal",
    "tin": "metal",
    "can": "metal",
    "newspaper": "paper",
    "carton": "cardboard",
}

PUBLIC_ACCESS_TYPES = {
    "public",
    "public_access",
    "community",
    "campus",
}

VERIFIED_STATUSES = {"verified"}
CONFIRMED_PARTNERSHIP_STATUSES = {"confirmed"}


class FacilityDataError(Exception):
    """Raised when a facility dataset is invalid."""


def normalize_material(material: str) -> str:
    value = material.strip().lower()
    return MATERIAL_ALIASES.get(value, value)


def parse_accepted_materials(value: str) -> set[str]:
    if not value:
        return set()

    return {
        normalize_material(item)
        for item in value.split(";")
        if item.strip()
    }


def parse_conditions(value: str) -> set[str]:
    if not value:
        return set()

    return {
        item.strip().lower().replace(" ", "_")
        for item in value.split(";")
        if item.strip()
    }


def parse_boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    return str(value).strip().lower() in {
        "true", "yes", "1", "active"
    }


def parse_number(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(number):
        return None

    return number


def haversine_distance(
    latitude1: float,
    longitude1: float,
    latitude2: float,
    longitude2: float,
) -> float:
    coordinates = [
        latitude1, longitude1, latitude2, longitude2
    ]

    if not all(math.isfinite(value) for value in coordinates):
        raise ValueError("Coordinates must be finite numbers.")

    if not -90 <= latitude1 <= 90:
        raise ValueError("Invalid first latitude.")
    if not -90 <= latitude2 <= 90:
        raise ValueError("Invalid second latitude.")
    if not -180 <= longitude1 <= 180:
        raise ValueError("Invalid first longitude.")
    if not -180 <= longitude2 <= 180:
        raise ValueError("Invalid second longitude.")

    radius_km = 6371.0

    lat1 = math.radians(latitude1)
    lat2 = math.radians(latitude2)
    delta_lat = math.radians(latitude2 - latitude1)
    delta_lon = math.radians(longitude2 - longitude1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_lon / 2) ** 2
    )

    a = min(1.0, max(0.0, a))
    angle = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return radius_km * angle


def load_facilities(
    file_path: Path,
    dataset_type: str,
) -> list[dict[str, Any]]:
    if dataset_type not in REQUIRED_FIELDS:
        raise FacilityDataError(
            f"Unsupported dataset type: {dataset_type}"
        )

    if not file_path.exists():
        raise FileNotFoundError(
            f"Facility dataset not found: {file_path}"
        )

    try:
        with file_path.open(
            "r", encoding="utf-8-sig", newline=""
        ) as file:
            reader = csv.DictReader(file)

            if not reader.fieldnames:
                raise FacilityDataError(
                    f"Dataset has no header: {file_path}"
                )

            missing = REQUIRED_FIELDS[dataset_type] - set(
                reader.fieldnames
            )

            if missing:
                raise FacilityDataError(
                    f"{dataset_type} is missing fields: "
                    f"{sorted(missing)}"
                )

            return list(reader)

    except csv.Error as exc:
        raise FacilityDataError(
            f"Could not parse {file_path}: {exc}"
        ) from exc


def _evaluate_facility(
    facility: dict[str, Any],
    dataset_type: str,
    material: str,
    condition: str,
    quantity_kg: float,
    user_latitude: float,
    user_longitude: float,
) -> tuple[dict[str, Any] | None, list[str]]:
    reasons = []

    facility_id_field = {
        "collection_points": "point_id",
        "recycling_partners": "partner_id",
        "external_recyclers": "facility_id",
    }[dataset_type]

    facility_id = facility.get(facility_id_field, "").strip()
    name = facility.get("name", "").strip()

    if not facility_id or not name:
        reasons.append("missing_facility_identity")

    if not parse_boolean(facility.get("is_active")):
        reasons.append("not_confirmed_active")

    if facility.get("verification_status", "").strip().lower() not in VERIFIED_STATUSES:
        reasons.append("not_verified")

    if not parse_boolean(facility.get("accepts_dropoff")):
        reasons.append("dropoff_not_confirmed")

    access = facility.get("access_type", "").strip().lower()
    if access not in PUBLIC_ACCESS_TYPES:
        reasons.append("access_not_confirmed")

    accepted = parse_accepted_materials(
        facility.get("accepted_materials", "")
    )
    if material not in accepted:
        reasons.append("material_not_accepted")

    accepted_conditions = parse_conditions(
        facility.get("accepted_waste_conditions", "")
    )
    if not accepted_conditions:
        reasons.append("accepted_conditions_not_specified")
    elif (
        condition not in accepted_conditions
        and not accepted_conditions.intersection({"any", "all"})
    ):
        reasons.append("waste_condition_not_accepted")

    minimum = parse_number(
        facility.get("minimum_quantity_kg")
    )
    maximum = parse_number(
        facility.get("maximum_quantity_kg")
    )

    if minimum is None:
        reasons.append("minimum_quantity_not_specified")
    elif quantity_kg < minimum:
        reasons.append("below_minimum_quantity")

    if maximum is not None and quantity_kg > maximum:
        reasons.append("above_maximum_quantity")

    latitude = parse_number(facility.get("latitude"))
    longitude = parse_number(facility.get("longitude"))

    if latitude is None or longitude is None:
        reasons.append("coordinates_not_available")
    else:
        if not -90 <= latitude <= 90:
            reasons.append("invalid_latitude")
        if not -180 <= longitude <= 180:
            reasons.append("invalid_longitude")

    if dataset_type == "recycling_partners":
        partnership = facility.get(
            "partnership_status", ""
        ).strip().lower()

        if partnership not in CONFIRMED_PARTNERSHIP_STATUSES:
            reasons.append("jijigreen_partnership_not_confirmed")

    capacity_available = None

    if dataset_type == "collection_points":
        capacity = parse_number(facility.get("capacity_kg"))
        current_load = parse_number(facility.get("current_load_kg"))

        if capacity is None or current_load is None:
            reasons.append("capacity_information_incomplete")
        elif capacity <= 0 or current_load < 0 or current_load > capacity:
            reasons.append("invalid_capacity_information")
        else:
            capacity_available = capacity - current_load
            if quantity_kg > capacity_available:
                reasons.append("insufficient_collection_capacity")

    if reasons:
        return None, reasons

    distance = haversine_distance(
        user_latitude,
        user_longitude,
        latitude,
        longitude,
    )

    result = {
        "facility_id": facility_id,
        "name": name,
        "location": facility.get("location", "").strip(),
        "facility_type": facility.get("facility_type", "").strip(),
        "tier": dataset_type,
        "accepted_materials": sorted(accepted),
        "accepted_waste_conditions": sorted(accepted_conditions),
        "minimum_quantity_kg": minimum,
        "maximum_quantity_kg": maximum,
        "distance_km": round(distance, 2),
        "distance_method": "haversine_straight_line",
        "latitude": latitude,
        "longitude": longitude,
        "opening_hours": facility.get("opening_hours", "").strip(),
        "access_type": access,
        "contact": facility.get("contact", "").strip(),
        "website": facility.get("website", "").strip(),
        "verification_status": facility.get(
            "verification_status", ""
        ).strip(),
        "partnership_status": facility.get(
            "partnership_status", ""
        ).strip() or "not_applicable",
        "capacity_available_kg": (
            round(capacity_available, 2)
            if capacity_available is not None else None
        ),
        "source_url": facility.get("source_url", "").strip(),
        "notes": facility.get("notes", "").strip(),
    }

    return result, []


def recommend_from_records(
    material: str,
    condition: str,
    quantity_kg: float,
    user_latitude: float,
    user_longitude: float,
    collection_points: list[dict[str, Any]],
    recycling_partners: list[dict[str, Any]],
    external_recyclers: list[dict[str, Any]],
) -> dict[str, Any]:
    if not material or not material.strip():
        raise ValueError("Material is required.")

    if not condition or not condition.strip():
        raise ValueError("Waste condition is required.")

    if not math.isfinite(quantity_kg) or quantity_kg <= 0:
        raise ValueError("Quantity must be a positive finite number.")

    if not -90 <= user_latitude <= 90:
        raise ValueError("Invalid user latitude.")

    if not -180 <= user_longitude <= 180:
        raise ValueError("Invalid user longitude.")

    material = normalize_material(material)
    condition = condition.strip().lower().replace(" ", "_")

    tiers = [
        (
            "jijigreen_collection_point",
            "JijiGreen-owned collection points",
            "collection_points",
            collection_points,
        ),
        (
            "contracted_partner",
            "Confirmed JijiGreen recycling partners",
            "recycling_partners",
            recycling_partners,
        ),
        (
            "external_recycler",
            "External non-partner recycling facilities",
            "external_recyclers",
            external_recyclers,
        ),
    ]

    exclusion_counts = {}
    exclusion_reasons = {}

    for tier_key, tier_label, dataset_type, facilities in tiers:
        eligible = []
        reason_counts = {}

        for facility in facilities:
            result, reasons = _evaluate_facility(
                facility,
                dataset_type,
                material,
                condition,
                quantity_kg,
                user_latitude,
                user_longitude,
            )

            if result:
                eligible.append(result)
            else:
                for reason in reasons:
                    reason_counts[reason] = (
                        reason_counts.get(reason, 0) + 1
                    )

        exclusion_counts[tier_key] = len(facilities) - len(eligible)
        exclusion_reasons[tier_key] = reason_counts

        if eligible:
            eligible.sort(
                key=lambda item: (
                    item["distance_km"],
                    item["name"].lower(),
                )
            )

            return {
                "status": "success",
                "requested_material": material,
                "requested_condition": condition,
                "requested_quantity_kg": quantity_kg,
                "selected_tier": tier_key,
                "tier_label": tier_label,
                "distance_method": "haversine_straight_line",
                "recommendation_count": len(eligible),
                "recommendations": eligible,
                "excluded_facility_counts": exclusion_counts,
                "excluded_reasons_by_tier": exclusion_reasons,
                "message": (
                    f"Found {len(eligible)} suitable facilities "
                    f"within {tier_label}. Facilities are ranked "
                    "by straight-line distance."
                ),
            }

    return {
        "status": "no_suitable_facilities",
        "requested_material": material,
        "requested_condition": condition,
        "requested_quantity_kg": quantity_kg,
        "selected_tier": None,
        "tier_label": None,
        "distance_method": "haversine_straight_line",
        "recommendation_count": 0,
        "recommendations": [],
        "excluded_facility_counts": exclusion_counts,
        "excluded_reasons_by_tier": exclusion_reasons,
        "message": (
            "No suitable verified facility was found in the "
            "available JijiGreen, contracted-partner or external "
            "recycler datasets. Do not travel without confirming "
            "acceptance directly with a facility."
        ),
    }


def recommend_collection_facilities(
    material: str,
    condition: str,
    quantity_kg: float,
    user_latitude: float,
    user_longitude: float,
) -> dict[str, Any]:
    collection_points = load_facilities(
        COLLECTION_POINTS_PATH, "collection_points"
    )
    recycling_partners = load_facilities(
        RECYCLING_PARTNERS_PATH, "recycling_partners"
    )
    external_recyclers = load_facilities(
        EXTERNAL_RECYCLERS_PATH, "external_recyclers"
    )

    return recommend_from_records(
        material=material,
        condition=condition,
        quantity_kg=quantity_kg,
        user_latitude=user_latitude,
        user_longitude=user_longitude,
        collection_points=collection_points,
        recycling_partners=recycling_partners,
        external_recyclers=external_recyclers,
    )

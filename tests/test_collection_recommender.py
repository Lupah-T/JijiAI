import unittest

from api.collection_recommender import (
    recommend_from_records,
    haversine_distance,
)


def make_point(
    point_id="CP001",
    name="Test JijiGreen Point",
    latitude=-1.0,
    longitude=37.0,
):
    return {
        "point_id": point_id,
        "name": name,
        "location": "Synthetic test location",
        "latitude": str(latitude),
        "longitude": str(longitude),
        "facility_type": "campus",
        "accepted_materials": "plastic;metal",
        "accepted_waste_conditions": "clean;dry",
        "minimum_quantity_kg": "0.5",
        "maximum_quantity_kg": "20",
        "opening_hours": "08:00-17:00",
        "access_type": "public",
        "accepts_dropoff": "true",
        "is_active": "true",
        "capacity_kg": "100",
        "current_load_kg": "10",
        "verification_status": "verified",
        "contact": "",
        "source_url": "",
        "notes": "Synthetic test record",
    }


def make_partner(
    partner_id="PTEST001",
    name="Test Contracted Partner",
    latitude=-1.0,
    longitude=37.0,
    partnership_status="confirmed",
):
    return {
        "partner_id": partner_id,
        "name": name,
        "location": "Synthetic test location",
        "latitude": str(latitude),
        "longitude": str(longitude),
        "facility_type": "recycler",
        "accepted_materials": "plastic;metal",
        "accepted_waste_conditions": "clean;dry",
        "minimum_quantity_kg": "0.5",
        "maximum_quantity_kg": "100",
        "opening_hours": "08:00-17:00",
        "access_type": "public",
        "accepts_dropoff": "true",
        "is_active": "true",
        "verification_status": "verified",
        "partnership_status": partnership_status,
        "contact": "",
        "website": "",
        "source_url": "",
        "notes": "Synthetic test record",
    }


def make_external(
    facility_id="ETEST001",
    name="Test External Recycler",
    latitude=-1.0,
    longitude=37.0,
):
    return {
        "facility_id": facility_id,
        "name": name,
        "location": "Synthetic test location",
        "latitude": str(latitude),
        "longitude": str(longitude),
        "facility_type": "recycler",
        "accepted_materials": "plastic;metal",
        "accepted_waste_conditions": "clean;dry",
        "minimum_quantity_kg": "0.5",
        "maximum_quantity_kg": "100",
        "opening_hours": "08:00-17:00",
        "access_type": "public",
        "accepts_dropoff": "true",
        "is_active": "true",
        "verification_status": "verified",
        "contact": "",
        "website": "",
        "source_url": "",
        "notes": "Synthetic test record",
    }


def recommend(points=None, partners=None, external=None,
              material="plastic", condition="clean", quantity=2):
    return recommend_from_records(
        material=material,
        condition=condition,
        quantity_kg=quantity,
        user_latitude=-1.0,
        user_longitude=37.0,
        collection_points=points or [],
        recycling_partners=partners or [],
        external_recyclers=external or [],
    )


class CollectionRecommenderTests(unittest.TestCase):

    def test_owned_point_has_highest_priority(self):
        point = make_point(latitude=-1.1)
        partner = make_partner(latitude=-1.001)

        result = recommend(
            points=[point],
            partners=[partner],
        )

        self.assertEqual(
            result["selected_tier"],
            "jijigreen_collection_point",
        )

    def test_falls_back_to_confirmed_partner(self):
        result = recommend(
            partners=[make_partner()]
        )

        self.assertEqual(
            result["selected_tier"],
            "contracted_partner",
        )

    def test_falls_back_to_external_recycler(self):
        result = recommend(
            external=[make_external()]
        )

        self.assertEqual(
            result["selected_tier"],
            "external_recycler",
        )

    def test_nearest_facility_is_first_within_tier(self):
        farther = make_point(
            "CP002", "Farther Point", -1.1, 37.0
        )
        nearer = make_point(
            "CP003", "Nearer Point", -1.01, 37.0
        )

        result = recommend(points=[farther, nearer])

        self.assertEqual(
            result["recommendations"][0]["name"],
            "Nearer Point",
        )

    def test_rejects_unaccepted_condition(self):
        point = make_point()
        point["accepted_waste_conditions"] = "dry"

        result = recommend(points=[point], condition="dirty")

        self.assertEqual(
            result["status"],
            "no_suitable_facilities",
        )

    def test_rejects_unconfirmed_partner(self):
        partner = make_partner(
            partnership_status="unconfirmed"
        )

        result = recommend(partners=[partner])

        self.assertEqual(
            result["status"],
            "no_suitable_facilities",
        )

    def test_rejects_insufficient_capacity(self):
        point = make_point()
        point["capacity_kg"] = "10"
        point["current_load_kg"] = "9"

        result = recommend(
            points=[point],
            quantity=2,
        )

        self.assertEqual(
            result["status"],
            "no_suitable_facilities",
        )

    def test_rejects_unverified_facility(self):
        point = make_point()
        point["verification_status"] = "needs_reverification"

        result = recommend(points=[point])

        self.assertEqual(
            result["status"],
            "no_suitable_facilities",
        )

    def test_rejects_wrong_material(self):
        point = make_point()
        point["accepted_materials"] = "metal"

        result = recommend(points=[point], material="plastic")

        self.assertEqual(
            result["status"],
            "no_suitable_facilities",
        )

    def test_haversine_distance(self):
        distance = haversine_distance(
            -1.0, 37.0, -1.1, 37.0
        )

        self.assertAlmostEqual(distance, 11.12, places=1)

    def test_rejects_invalid_quantity(self):
        with self.assertRaises(ValueError):
            recommend(quantity=0)

    def test_rejects_invalid_user_coordinates(self):
        with self.assertRaises(ValueError):
            recommend_from_records(
                material="plastic",
                condition="clean",
                quantity_kg=2,
                user_latitude=100,
                user_longitude=37,
                collection_points=[],
                recycling_partners=[],
                external_recyclers=[],
            )


if __name__ == "__main__":
    unittest.main()

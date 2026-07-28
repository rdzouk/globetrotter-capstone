class Review {
  final num rating;
  final String comment;
  final String visitedDate;

  Review({required this.rating, required this.comment, required this.visitedDate});

  factory Review.fromJson(Map<String, dynamic> json) {
    return Review(
      rating: json['rating'],
      comment: json['comment'] ?? '',
      visitedDate: json['visited_date'],
    );
  }
}

class Itinerary {
  final int id;
  final int destinationId;
  final String startDate;
  final String endDate;
  final String notes;
  final bool visited;
  final Review? review;

  Itinerary({
    required this.id,
    required this.destinationId,
    required this.startDate,
    required this.endDate,
    required this.notes,
    required this.visited,
    required this.review,
  });

  factory Itinerary.fromJson(Map<String, dynamic> json) {
    return Itinerary(
      id: json['id'],
      destinationId: json['destination_id'],
      startDate: json['start_date'],
      endDate: json['end_date'],
      notes: json['notes'] ?? '',
      visited: json['visited'] ?? false,
      review: json['review'] != null ? Review.fromJson(json['review']) : null,
    );
  }
}

/// A review as returned by GET /destinations/<id>/reviews — includes the
/// reviewer's display name, since this is the public "place page" view.
class PlaceReview {
  final int itineraryId;
  final String reviewerName;
  final num rating;
  final String comment;
  final String visitedDate;

  PlaceReview({
    required this.itineraryId,
    required this.reviewerName,
    required this.rating,
    required this.comment,
    required this.visitedDate,
  });

  factory PlaceReview.fromJson(Map<String, dynamic> json) {
    return PlaceReview(
      itineraryId: json['itinerary_id'],
      reviewerName: json['reviewer_name'],
      rating: json['rating'],
      comment: json['comment'] ?? '',
      visitedDate: json['visited_date'],
    );
  }
}

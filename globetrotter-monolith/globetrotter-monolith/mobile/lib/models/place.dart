class Place {
  final int id;
  final String name;
  final String category; // restaurant | sports | spa | nightlife | hotel | attraction | entertainment | landmark
  final String neighborhood;
  final String address;
  final double lat;
  final double lng;
  final double rating;
  final int ratingCount;
  final int? priceLevel;
  final String? phone;
  final List<String> tags;
  final String description;
  final String? imageUrl;

  Place({
    required this.id,
    required this.name,
    required this.category,
    required this.neighborhood,
    required this.address,
    required this.lat,
    required this.lng,
    required this.rating,
    required this.ratingCount,
    required this.priceLevel,
    required this.phone,
    required this.tags,
    required this.description,
    this.imageUrl,
  });

  factory Place.fromJson(Map<String, dynamic> json) {
    return Place(
      id: json['id'],
      name: json['name'],
      category: json['category'],
      neighborhood: json['neighborhood'],
      address: json['address'],
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      rating: (json['rating'] as num).toDouble(),
      ratingCount: json['rating_count'],
      priceLevel: json['price_level'],
      phone: json['phone'],
      tags: List<String>.from(json['tags'] ?? []),
      description: json['description'] ?? '',
      imageUrl: json['image_url'],
    );
  }
}

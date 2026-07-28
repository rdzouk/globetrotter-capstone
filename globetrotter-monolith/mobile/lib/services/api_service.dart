import 'dart:convert';
import 'package:http/http.dart' as http;

import '../models/place.dart';
import '../models/itinerary.dart';
import '../models/app_feedback.dart';

/// Thrown when the API returns a non-2xx response. Carries the
/// human-readable message(s) the backend sent back so the UI can show
/// them directly instead of a generic "something went wrong".
class ApiException implements Exception {
  final int statusCode;
  final List<String> errors;
  ApiException(this.statusCode, this.errors);

  @override
  String toString() => errors.join(', ');
}

class ApiService {
  /// IMPORTANT: change this to match where your Flask backend actually
  /// runs. `localhost` only works from a desktop browser or an iOS
  /// simulator — an Android emulator must use 10.0.2.2, and a real
  /// phone on your Wi-Fi must use your computer's LAN IP
  /// (e.g. http://192.168.1.42:5000). See mobile/README.md.
  static const String baseUrl = "http://10.0.2.2:5000";

  String? _token;

  void setToken(String? token) => _token = token;

  Map<String, String> get _headers => {
        "Content-Type": "application/json",
        if (_token != null) "Authorization": "Bearer $_token",
      };

  Map<String, dynamic> _decodeObject(http.Response res) {
    final body = jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return body as Map<String, dynamic>;
    }
    final errors = body is Map && body['errors'] != null
        ? List<String>.from(body['errors'])
        : [body is Map ? (body['error'] ?? 'Request failed').toString() : 'Request failed'];
    throw ApiException(res.statusCode, errors);
  }

  List<dynamic> _decodeList(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return jsonDecode(res.body) as List<dynamic>;
    }
    final body = jsonDecode(res.body);
    final errors = body is Map && body['errors'] != null
        ? List<String>.from(body['errors'])
        : [body is Map ? (body['error'] ?? 'Request failed').toString() : 'Request failed'];
    throw ApiException(res.statusCode, errors);
  }

  // ---- Auth ----

  Future<Map<String, dynamic>> register({
    required String name,
    String? email,
    String? phone,
    required String password,
    List<String> preferences = const [],
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/register'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        if (email != null && email.isNotEmpty) 'email': email,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        'password': password,
        'preferences': preferences,
      }),
    );
    return _decodeObject(res);
  }

  Future<Map<String, String>> login({String? email, String? phone, required String password}) async {
    final res = await http.post(
      Uri.parse('$baseUrl/login'),
      headers: _headers,
      body: jsonEncode({
        if (email != null && email.isNotEmpty) 'email': email,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        'password': password,
      }),
    );
    final data = _decodeObject(res);
    return {'token': data['token'] as String, 'name': data['name'] as String};
  }

  // ---- Destinations ----

  Future<List<Place>> getDestinations({
    String? query,
    String? category,
    String? neighborhood,
    String? tag,
  }) async {
    final params = <String, String>{};
    if (query != null && query.isNotEmpty) params['q'] = query;
    if (category != null && category.isNotEmpty) params['category'] = category;
    if (neighborhood != null && neighborhood.isNotEmpty) params['neighborhood'] = neighborhood;
    if (tag != null && tag.isNotEmpty) params['tag'] = tag;

    final uri = Uri.parse('$baseUrl/destinations').replace(queryParameters: params);
    final res = await http.get(uri, headers: _headers);
    return _decodeList(res).map((j) => Place.fromJson(j)).toList();
  }

  Future<List<PlaceReview>> getDestinationReviews(int destinationId) async {
    final res = await http.get(Uri.parse('$baseUrl/destinations/$destinationId/reviews'), headers: _headers);
    return _decodeList(res).map((j) => PlaceReview.fromJson(j)).toList();
  }

  // ---- Recommendations ----

  Future<List<Place>> getRecommendations({int limit = 5}) async {
    final uri = Uri.parse('$baseUrl/recommendations').replace(queryParameters: {'limit': '$limit'});
    final res = await http.get(uri, headers: _headers);
    return _decodeList(res).map((j) => Place.fromJson(j)).toList();
  }

  // ---- Itineraries ----

  Future<Itinerary> createItinerary({
    required int destinationId,
    required String startDate,
    required String endDate,
    String notes = '',
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/itineraries'),
      headers: _headers,
      body: jsonEncode({
        'destination_id': destinationId,
        'start_date': startDate,
        'end_date': endDate,
        'notes': notes,
      }),
    );
    return Itinerary.fromJson(_decodeObject(res));
  }

  Future<List<Itinerary>> getItineraries() async {
    final res = await http.get(Uri.parse('$baseUrl/itineraries'), headers: _headers);
    return _decodeList(res).map((j) => Itinerary.fromJson(j)).toList();
  }

  Future<Itinerary> markVisited({
    required int itineraryId,
    required num rating,
    required String comment,
    required String visitedDate,
  }) async {
    final res = await http.patch(
      Uri.parse('$baseUrl/itineraries/$itineraryId/visit'),
      headers: _headers,
      body: jsonEncode({
        'rating': rating,
        'comment': comment,
        'visited_date': visitedDate,
      }),
    );
    return Itinerary.fromJson(_decodeObject(res));
  }

  // ---- App feedback ----

  Future<AppFeedback> submitFeedback({required String message, num? rating}) async {
    final res = await http.post(
      Uri.parse('$baseUrl/feedback'),
      headers: _headers,
      body: jsonEncode({'message': message, if (rating != null) 'rating': rating}),
    );
    return AppFeedback.fromJson(_decodeObject(res));
  }

  Future<List<AppFeedback>> getFeedback() async {
    final res = await http.get(Uri.parse('$baseUrl/feedback'), headers: _headers);
    return _decodeList(res).map((j) => AppFeedback.fromJson(j)).toList();
  }
}

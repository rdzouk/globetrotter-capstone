import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';

import '../models/place.dart';
import '../models/itinerary.dart';
import '../services/api_service.dart';
import '../widgets/place_card.dart';

class PlaceDetailScreen extends StatefulWidget {
  final Place place;
  const PlaceDetailScreen({super.key, required this.place});

  @override
  State<PlaceDetailScreen> createState() => _PlaceDetailScreenState();
}

class _PlaceDetailScreenState extends State<PlaceDetailScreen> {
  List<PlaceReview> _reviews = [];
  bool _loadingReviews = true;

  @override
  void initState() {
    super.initState();
    _loadReviews();
  }

  Future<void> _loadReviews() async {
    setState(() => _loadingReviews = true);
    try {
      final api = context.read<ApiService>();
      final reviews = await api.getDestinationReviews(widget.place.id);
      setState(() => _reviews = reviews);
    } catch (_) {
      // Non-critical — the rest of the page still works without reviews.
    } finally {
      if (mounted) setState(() => _loadingReviews = false);
    }
  }

  Future<void> _planItinerary() async {
    final now = DateTime.now();
    final start = await showDatePicker(
      context: context, initialDate: now, firstDate: now, lastDate: now.add(const Duration(days: 730)),
      helpText: 'Start date',
    );
    if (start == null || !mounted) return;
    final end = await showDatePicker(
      context: context, initialDate: start, firstDate: start, lastDate: now.add(const Duration(days: 730)),
      helpText: 'End date',
    );
    if (end == null || !mounted) return;

    try {
      final api = context.read<ApiService>();
      await api.createItinerary(
        destinationId: widget.place.id,
        startDate: DateFormat('yyyy-MM-dd').format(start),
        endDate: DateFormat('yyyy-MM-dd').format(end),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Itinerary saved! Check the Trips tab.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.errors.join(', '))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final place = widget.place;
    final color = categoryColors[place.category] ?? Colors.grey;

    return Scaffold(
      appBar: AppBar(title: Text(place.name)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
                child: Text(place.category, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.star, color: Colors.amber, size: 18),
              Text(' ${place.rating} (${place.ratingCount} ratings)'),
            ],
          ),
          const SizedBox(height: 12),
          Text('${place.neighborhood} · ${place.address}', style: TextStyle(color: Colors.grey.shade600)),
          if (place.phone != null) Text(place.phone!, style: TextStyle(color: Colors.grey.shade600)),
          const SizedBox(height: 12),
          Text(place.description),
          const SizedBox(height: 12),
          Wrap(spacing: 6, children: place.tags.map((t) => Chip(label: Text(t))).toList()),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: _planItinerary,
            icon: const Icon(Icons.event_available),
            label: const Text('Plan an itinerary here'),
          ),
          const SizedBox(height: 28),
          Text('Reviews', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          if (_loadingReviews)
            const Center(child: CircularProgressIndicator())
          else if (_reviews.isEmpty)
            Text('No reviews yet — be the first to visit and review this place!',
                style: TextStyle(color: Colors.grey.shade600))
          else
            ..._reviews.map((r) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(r.reviewerName, style: const TextStyle(fontWeight: FontWeight.bold)),
                            const Spacer(),
                            Row(
                              children: List.generate(
                                5,
                                (i) => Icon(
                                  i < r.rating.round() ? Icons.star : Icons.star_border,
                                  size: 16,
                                  color: Colors.amber,
                                ),
                              ),
                            ),
                          ],
                        ),
                        Text(r.visitedDate, style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                        if (r.comment.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(r.comment),
                        ],
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';

import '../models/place.dart';
import '../models/itinerary.dart';
import '../services/api_service.dart';

class ItinerariesScreen extends StatefulWidget {
  const ItinerariesScreen({super.key});

  @override
  State<ItinerariesScreen> createState() => _ItinerariesScreenState();
}

class _ItinerariesScreenState extends State<ItinerariesScreen> {
  List<Itinerary> _itineraries = [];
  Map<int, Place> _placesById = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final results = await Future.wait([api.getItineraries(), api.getDestinations()]);
      final itineraries = results[0] as List<Itinerary>;
      final places = results[1] as List<Place>;
      setState(() {
        _itineraries = itineraries;
        _placesById = {for (final p in places) p.id: p};
      });
    } catch (e) {
      setState(() => _error = 'Could not load your itineraries.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openMarkVisited(Itinerary itinerary) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _MarkVisitedSheet(itinerary: itinerary),
    );
    if (result == null) return;

    try {
      final api = context.read<ApiService>();
      await api.markVisited(
        itineraryId: itinerary.id,
        rating: result['rating'],
        comment: result['comment'],
        visitedDate: result['visitedDate'],
      );
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Thanks for your review!')));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.errors.join(', '))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My itineraries')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _itineraries.isEmpty
                    ? ListView(
                        children: const [
                          Padding(
                            padding: EdgeInsets.all(32),
                            child: Text(
                              'No itineraries yet. Go to Explore and plan one!',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _itineraries.length,
                        itemBuilder: (context, i) {
                          final it = _itineraries[i];
                          final place = _placesById[it.destinationId];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(place?.name ?? 'Place #${it.destinationId}',
                                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                      ),
                                      if (it.visited)
                                        const Chip(
                                          label: Text('Visited'),
                                          avatar: Icon(Icons.check_circle, size: 16, color: Colors.green),
                                          visualDensity: VisualDensity.compact,
                                        ),
                                    ],
                                  ),
                                  if (place != null)
                                    Text('${place.neighborhood} · ${place.category}',
                                        style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                                  const SizedBox(height: 6),
                                  Text('${it.startDate}  →  ${it.endDate}'),
                                  if (it.notes.isNotEmpty) Text(it.notes, style: TextStyle(color: Colors.grey.shade600)),
                                  if (it.review != null) ...[
                                    const Divider(),
                                    Row(
                                      children: List.generate(
                                        5,
                                        (idx) => Icon(
                                          idx < it.review!.rating.round() ? Icons.star : Icons.star_border,
                                          size: 16,
                                          color: Colors.amber,
                                        ),
                                      ),
                                    ),
                                    if (it.review!.comment.isNotEmpty) Text(it.review!.comment),
                                  ],
                                  if (!it.visited) ...[
                                    const SizedBox(height: 8),
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: OutlinedButton.icon(
                                        onPressed: () => _openMarkVisited(it),
                                        icon: const Icon(Icons.rate_review_outlined, size: 18),
                                        label: const Text('Mark visited & review'),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}

class _MarkVisitedSheet extends StatefulWidget {
  final Itinerary itinerary;
  const _MarkVisitedSheet({required this.itinerary});

  @override
  State<_MarkVisitedSheet> createState() => _MarkVisitedSheetState();
}

class _MarkVisitedSheetState extends State<_MarkVisitedSheet> {
  int _rating = 5;
  final _commentController = TextEditingController();
  DateTime _visitedDate = DateTime.now();

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('How was it?', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final starValue = i + 1;
              return IconButton(
                onPressed: () => setState(() => _rating = starValue),
                icon: Icon(
                  starValue <= _rating ? Icons.star : Icons.star_border,
                  color: Colors.amber,
                  size: 32,
                ),
              );
            }),
          ),
          TextField(
            controller: _commentController,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Comment (optional)'),
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Visited on'),
            subtitle: Text(DateFormat('yyyy-MM-dd').format(_visitedDate)),
            trailing: const Icon(Icons.calendar_today, size: 18),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _visitedDate,
                firstDate: DateTime.now().subtract(const Duration(days: 3650)),
                lastDate: DateTime.now(),
              );
              if (picked != null) setState(() => _visitedDate = picked);
            },
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop({
              'rating': _rating,
              'comment': _commentController.text.trim(),
              'visitedDate': DateFormat('yyyy-MM-dd').format(_visitedDate),
            }),
            child: const Text('Save review'),
          ),
        ],
      ),
    );
  }
}

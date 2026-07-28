import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/place.dart';
import '../services/api_service.dart';
import '../widgets/place_card.dart';
import 'place_detail_screen.dart';

const _categories = ['restaurant', 'sports', 'spa', 'nightlife', 'hotel', 'attraction'];
const _neighborhoods = [
  'Bastos', 'Centre-ville', 'Hippodrome', 'Nlongkak', 'Elig-Essono', 'Etoa-Meki',
  'Essos', 'Ngousso', 'Odza', 'Biyem-Assi', 'Mvan', 'Mimboman', 'Warda',
  'Nkolbisson', 'Nsimalen', 'Olembe', 'Soa',
];

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final _searchController = TextEditingController();
  String? _category;
  String? _neighborhood;

  List<Place> _places = [];
  bool _loading = true;
  String? _error;
  final MapController _mapController = MapController();

  static const _yaoundeCenter = LatLng(3.8667, 11.5167);

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
      final places = await api.getDestinations(
        query: _searchController.text.trim(),
        category: _category,
        neighborhood: _neighborhood,
      );
      setState(() => _places = places);
      if (places.isNotEmpty) {
        // Fit the map roughly around the results.
        final lats = places.map((p) => p.lat);
        final lngs = places.map((p) => p.lng);
        final bounds = LatLngBounds(
          LatLng(lats.reduce((a, b) => a < b ? a : b), lngs.reduce((a, b) => a < b ? a : b)),
          LatLng(lats.reduce((a, b) => a > b ? a : b), lngs.reduce((a, b) => a > b ? a : b)),
        );
        try {
          _mapController.fitCamera(CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(40)));
        } catch (_) {
          // Map not attached yet on first load — harmless, it'll just stay centered on Yaoundé.
        }
      }
    } catch (e) {
      setState(() => _error = 'Could not load places. Is the backend running?');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openPlace(Place place) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => PlaceDetailScreen(place: place)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Explore Yaoundé')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search by name, neighborhood, description...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _load),
                  ),
                  onSubmitted: (_) => _load(),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _category,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Category', isDense: true),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('Any')),
                          ..._categories.map((c) => DropdownMenuItem(value: c, child: Text(c))),
                        ],
                        onChanged: (v) {
                          setState(() => _category = v);
                          _load();
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _neighborhood,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Neighborhood', isDense: true),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('Any')),
                          ..._neighborhoods.map((n) => DropdownMenuItem(value: n, child: Text(n))),
                        ],
                        onChanged: (v) {
                          setState(() => _neighborhood = v);
                          _load();
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          SizedBox(
            height: 240,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(0),
              child: FlutterMap(
                mapController: _mapController,
                options: const MapOptions(initialCenter: _yaoundeCenter, initialZoom: 12),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.globetrotter.mobile',
                  ),
                  MarkerLayer(
                    markers: _places.map((p) {
                      final color = categoryColors[p.category] ?? Colors.grey;
                      return Marker(
                        point: LatLng(p.lat, p.lng),
                        width: 36,
                        height: 36,
                        child: GestureDetector(
                          onTap: () => _openPlace(p),
                          child: Icon(Icons.location_on, color: color, size: 36),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Text(_error!))
                    : _places.isEmpty
                        ? const Center(child: Text('No places match that search.'))
                        : ListView.builder(
                            padding: const EdgeInsets.all(12),
                            itemCount: _places.length,
                            itemBuilder: (context, i) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: PlaceCard(place: _places[i], onTap: () => _openPlace(_places[i])),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

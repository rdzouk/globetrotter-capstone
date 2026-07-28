import 'package:flutter/material.dart';

import '../models/place.dart';

const Map<String, Color> categoryColors = {
  'restaurant': Color(0xFFC0392B),
  'sports': Color(0xFF2980B9),
  'spa': Color(0xFF8E44AD),
  'nightlife': Color(0xFFD35400),
  'hotel': Color(0xFF16A085),
  'attraction': Color(0xFF27AE60),
};

class PlaceCard extends StatelessWidget {
  final Place place;
  final VoidCallback onTap;

  const PlaceCard({super.key, required this.place, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = categoryColors[place.category] ?? Colors.grey;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      place.name,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
                    child: Text(
                      place.category,
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('${place.neighborhood} · ${place.address}',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              const SizedBox(height: 6),
              Text(place.description, maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.star, color: Colors.amber, size: 18),
                  const SizedBox(width: 4),
                  Text('${place.rating} (${place.ratingCount})',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const Spacer(),
                  ...place.tags.take(2).map((t) => Padding(
                        padding: const EdgeInsets.only(left: 4),
                        child: Chip(
                          label: Text(t, style: const TextStyle(fontSize: 10)),
                          padding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                      )),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

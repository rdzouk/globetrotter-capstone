import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/app_feedback.dart';
import '../services/api_service.dart';

class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({super.key});

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  final _messageController = TextEditingController();
  int? _rating;
  bool _submitting = false;

  List<AppFeedback> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final items = await api.getFeedback();
      setState(() => _items = items.reversed.toList());
    } catch (_) {
      // Non-critical for this screen's primary purpose (submitting feedback).
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_messageController.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      final api = context.read<ApiService>();
      await api.submitFeedback(message: _messageController.text.trim(), rating: _rating);
      _messageController.clear();
      setState(() => _rating = null);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Thanks for the feedback!')));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.errors.join(', '))));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('App feedback')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Tell us what you think', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            TextField(
              controller: _messageController,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'What do you like? What could be better?',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('Rating (optional): '),
                ...List.generate(5, (i) {
                  final starValue = i + 1;
                  return IconButton(
                    onPressed: () => setState(() => _rating = _rating == starValue ? null : starValue),
                    icon: Icon(
                      _rating != null && starValue <= _rating! ? Icons.star : Icons.star_border,
                      color: Colors.amber,
                    ),
                  );
                }),
              ],
            ),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Submit feedback'),
            ),
            const Divider(height: 40),
            Text('What others are saying', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_items.isEmpty)
              Text('No feedback yet — be the first!', style: TextStyle(color: Colors.grey.shade600))
            else
              ..._items.map((f) => Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(f.userName, style: const TextStyle(fontWeight: FontWeight.bold)),
                              const Spacer(),
                              if (f.rating != null)
                                Row(
                                  children: List.generate(
                                    5,
                                    (i) => Icon(
                                      i < f.rating!.round() ? Icons.star : Icons.star_border,
                                      size: 14,
                                      color: Colors.amber,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(f.message),
                        ],
                      ),
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}

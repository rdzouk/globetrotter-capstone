import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService api;
  AuthProvider(this.api);

  String? _token;
  String? _name;

  bool get isLoggedIn => _token != null;
  String? get name => _name;

  /// Call once at app startup to restore a saved session, if any.
  Future<void> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('gt_token');
    final name = prefs.getString('gt_name');
    if (token != null) {
      _token = token;
      _name = name;
      api.setToken(token);
      notifyListeners();
    }
  }

  Future<void> register({
    required String name,
    String? email,
    String? phone,
    required String password,
    List<String> preferences = const [],
  }) async {
    await api.register(
      name: name, email: email, phone: phone,
      password: password, preferences: preferences,
    );
  }

  Future<void> login({String? email, String? phone, required String password}) async {
    final result = await api.login(email: email, phone: phone, password: password);
    _token = result['token'];
    _name = result['name'];
    api.setToken(_token);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('gt_token', _token!);
    await prefs.setString('gt_name', _name!);
    notifyListeners();
  }

  Future<void> logout() async {
    _token = null;
    _name = null;
    api.setToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('gt_token');
    await prefs.remove('gt_name');
    notifyListeners();
  }
}

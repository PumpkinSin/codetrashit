import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/app_state.dart';

class ApiService {
  final String baseUrl;

  ApiService({this.baseUrl = 'http://localhost:3457'});

  Future<ServiceStatus?> getStatus() async {
    try {
      final resp = await http.get(Uri.parse('$baseUrl/api/status')).timeout(const Duration(seconds: 3));
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        return ServiceStatus.fromJson(data);
      }
    } catch (_) {}
    return null;
  }

  Future<bool> manualFetch() async {
    try {
      final resp = await http.post(
        Uri.parse('$baseUrl/api/fetch'),
        headers: {'Content-Type': 'application/json'},
      );
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> manualSync() async {
    try {
      final resp = await http.post(
        Uri.parse('$baseUrl/api/sync'),
        headers: {'Content-Type': 'application/json'},
      );
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// 刷新豆瓣关注列表缓存，返回 {success, count} 或 {success:false, error}
  Future<Map<String, dynamic>> refreshDoubanFollowing() async {
    try {
      final resp = await http
          .post(
            Uri.parse('$baseUrl/api/douban/refresh-following'),
            headers: {'Content-Type': 'application/json'},
          )
          .timeout(const Duration(seconds: 120));
      if (resp.statusCode == 200) {
        return json.decode(resp.body);
      }
      return {'success': false, 'error': 'HTTP ${resp.statusCode}'};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<List<BrowserInfo>> getBrowsers() async {
    try {
      final resp = await http.get(Uri.parse('$baseUrl/api/cookies/browsers'));
      if (resp.statusCode == 200) {
        final List<dynamic> list = json.decode(resp.body);
        return list.map((b) => BrowserInfo.fromJson(b as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  Future<Map<String, dynamic>> extractCookies({
    required String browserType,
    required String profilePath,
    required List<String> domains,
  }) async {
    try {
      final resp = await http.post(
        Uri.parse('$baseUrl/api/cookies/extract'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'browserType': browserType,
          'profilePath': profilePath,
          'domains': domains,
        }),
      );
      if (resp.statusCode == 200) {
        return json.decode(resp.body);
      }
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
    return {'success': false, 'error': 'Request failed'};
  }

  Future<bool> saveCookie({required String platform, required String cookie}) async {
    try {
      final resp = await http.post(
        Uri.parse('$baseUrl/api/cookies/save'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'platform': platform,
          'cookie': cookie,
        }),
      );
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        return data['success'] == true;
      }
    } catch (_) {}
    return false;
  }

  Future<List<String>> getKeywords() async {
    try {
      final resp = await http.get(Uri.parse('$baseUrl/api/config'));
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        final list = (data['bilibili_keywords'] as List<dynamic>?) ?? [];
        return list.map((k) => k.toString()).toList();
      }
    } catch (_) {}
    return [];
  }

  Future<List<String>> modifyKeyword(String action, String keyword) async {
    try {
      final resp = await http.post(
        Uri.parse('$baseUrl/api/config/keywords'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'action': action,
          'keyword': keyword,
        }),
      );
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        final list = (data['keywords'] as List<dynamic>?) ?? [];
        return list.map((k) => k.toString()).toList();
      }
    } catch (_) {}
    return [];
  }
}

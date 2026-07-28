class AppFeedback {
  final int id;
  final String userName;
  final String message;
  final num? rating;

  AppFeedback({
    required this.id,
    required this.userName,
    required this.message,
    required this.rating,
  });

  factory AppFeedback.fromJson(Map<String, dynamic> json) {
    return AppFeedback(
      id: json['id'],
      userName: json['user_name'],
      message: json['message'],
      rating: json['rating'],
    );
  }
}

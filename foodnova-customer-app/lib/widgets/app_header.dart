import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class AppHeader extends StatelessWidget {
  const AppHeader({
    this.greeting = 'Good day',
    this.subtitle,
    this.avatarUrl = '',
    this.initials = 'FN',
    this.actions = const [],
    super.key,
  });

  final String greeting;
  final String? subtitle;
  final String avatarUrl;
  final String initials;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface.withValues(alpha: .96),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: .07),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _HeaderAvatar(avatarUrl: avatarUrl, initials: initials),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  greeting,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ...actions,
        ],
      ),
    );
  }
}

class _HeaderAvatar extends StatelessWidget {
  const _HeaderAvatar({required this.avatarUrl, required this.initials});

  final String avatarUrl;
  final String initials;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fallback = CircleAvatar(
      radius: 24,
      backgroundColor: scheme.primary,
      child: Text(
        initials,
        style: TextStyle(color: scheme.onPrimary, fontWeight: FontWeight.w900),
      ),
    );
    if (avatarUrl.isEmpty) return fallback;
    return CachedNetworkImage(
      imageUrl: avatarUrl,
      imageBuilder: (_, imageProvider) => CircleAvatar(
        radius: 24,
        backgroundImage: imageProvider,
      ),
      placeholder: (_, __) => CircleAvatar(
        radius: 24,
        backgroundColor: scheme.surfaceContainerHighest,
        child: const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      errorWidget: (_, __, ___) => fallback,
    );
  }
}

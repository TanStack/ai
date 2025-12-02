<?php $__currentLoopData = $exception->frames(); $__env->addLoop($__currentLoopData); foreach($__currentLoopData as $frame): $__env->incrementLoopIndices(); $loop = $__env->getLastLoop(); ?>
    <div
        class="sm:col-span-2"
        x-show="index === <?php echo e($loop->index); ?>"
    >
        <div class="mb-3">
            <div class="text-md text-gray-500 dark:text-gray-400">
                <div class="mb-2">

                    <?php if(config('app.editor')): ?>
                        <a href="<?php echo e($frame->editorHref()); ?>" class="text-blue-500 hover:underline">
                            <span class="wrap text-gray-900 dark:text-gray-300"><?php echo e($frame->file()); ?></span>
                        </a>
                    <?php else: ?>
                        <span class="wrap text-gray-900 dark:text-gray-300"><?php echo e($frame->file()); ?></span>
                    <?php endif; ?>

                    <span class="font-mono text-xs">:<?php echo e($frame->line()); ?></span>
                </div>
            </div>
        </div>
        <div class="pt-4 text-sm text-gray-500 dark:text-gray-400">
            <pre class="h-[32.5rem] rounded-md dark:bg-gray-800 border dark:border-gray-700"><template x-if="true"><code
                    style="display: none;"
                    id="frame-<?php echo e($loop->index); ?>"
                    class="language-php highlightable-code <?php if($loop->index === $exception->defaultFrame()): ?> default-highlightable-code <?php endif; ?> scrollbar-hidden overflow-y-hidden"
                    data-line-number="<?php echo e($frame->line()); ?>"
                    data-ln-start-from="<?php echo e(max($frame->line() - 5, 1)); ?>"
                ><?php echo e($frame->snippet()); ?></code></template></pre>
        </div>
    </div>
<?php endforeach; $__env->popLoop(); $loop = $__env->getLastLoop(); ?>
<?php /**PATH /Users/jherr/projects/tanstack/ai/examples/php-laravel/backend/vendor/laravel/framework/src/Illuminate/Foundation/Providers/../resources/exceptions/renderer/components/editor.blade.php ENDPATH**/ ?>
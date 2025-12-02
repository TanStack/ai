<?php if (isset($component)) { $__componentOriginal74daf2d0a9c625ad90327a6043d15980 = $component; } ?>
<?php if (isset($attributes)) { $__attributesOriginal74daf2d0a9c625ad90327a6043d15980 = $attributes; } ?>
<?php $component = Illuminate\View\AnonymousComponent::resolve(['view' => 'laravel-exceptions-renderer::components.card','data' => ['class' => 'mt-6 overflow-x-auto']] + (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag ? $attributes->all() : [])); ?>
<?php $component->withName('laravel-exceptions-renderer::card'); ?>
<?php if ($component->shouldRender()): ?>
<?php $__env->startComponent($component->resolveView(), $component->data()); ?>
<?php if (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag): ?>
<?php $attributes = $attributes->except(\Illuminate\View\AnonymousComponent::ignoredParameterNames()); ?>
<?php endif; ?>
<?php $component->withAttributes(['class' => 'mt-6 overflow-x-auto']); ?>
    <div
        x-data="{
            includeVendorFrames: false,
            index: <?php echo e($exception->defaultFrame()); ?>,
        }"
    >
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3" x-clock>
            <?php if (isset($component)) { $__componentOriginal92c1a431b4816bac5d5a20d0fc1238ab = $component; } ?>
<?php if (isset($attributes)) { $__attributesOriginal92c1a431b4816bac5d5a20d0fc1238ab = $attributes; } ?>
<?php $component = Illuminate\View\AnonymousComponent::resolve(['view' => 'laravel-exceptions-renderer::components.trace','data' => ['exception' => $exception]] + (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag ? $attributes->all() : [])); ?>
<?php $component->withName('laravel-exceptions-renderer::trace'); ?>
<?php if ($component->shouldRender()): ?>
<?php $__env->startComponent($component->resolveView(), $component->data()); ?>
<?php if (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag): ?>
<?php $attributes = $attributes->except(\Illuminate\View\AnonymousComponent::ignoredParameterNames()); ?>
<?php endif; ?>
<?php $component->withAttributes(['exception' => \Illuminate\View\Compilers\BladeCompiler::sanitizeComponentAttribute($exception)]); ?>
<?php echo $__env->renderComponent(); ?>
<?php endif; ?>
<?php if (isset($__attributesOriginal92c1a431b4816bac5d5a20d0fc1238ab)): ?>
<?php $attributes = $__attributesOriginal92c1a431b4816bac5d5a20d0fc1238ab; ?>
<?php unset($__attributesOriginal92c1a431b4816bac5d5a20d0fc1238ab); ?>
<?php endif; ?>
<?php if (isset($__componentOriginal92c1a431b4816bac5d5a20d0fc1238ab)): ?>
<?php $component = $__componentOriginal92c1a431b4816bac5d5a20d0fc1238ab; ?>
<?php unset($__componentOriginal92c1a431b4816bac5d5a20d0fc1238ab); ?>
<?php endif; ?>
            <?php if (isset($component)) { $__componentOriginala2de13eefed6710e7b4064d57c6d0e47 = $component; } ?>
<?php if (isset($attributes)) { $__attributesOriginala2de13eefed6710e7b4064d57c6d0e47 = $attributes; } ?>
<?php $component = Illuminate\View\AnonymousComponent::resolve(['view' => 'laravel-exceptions-renderer::components.editor','data' => ['exception' => $exception]] + (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag ? $attributes->all() : [])); ?>
<?php $component->withName('laravel-exceptions-renderer::editor'); ?>
<?php if ($component->shouldRender()): ?>
<?php $__env->startComponent($component->resolveView(), $component->data()); ?>
<?php if (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag): ?>
<?php $attributes = $attributes->except(\Illuminate\View\AnonymousComponent::ignoredParameterNames()); ?>
<?php endif; ?>
<?php $component->withAttributes(['exception' => \Illuminate\View\Compilers\BladeCompiler::sanitizeComponentAttribute($exception)]); ?>
<?php echo $__env->renderComponent(); ?>
<?php endif; ?>
<?php if (isset($__attributesOriginala2de13eefed6710e7b4064d57c6d0e47)): ?>
<?php $attributes = $__attributesOriginala2de13eefed6710e7b4064d57c6d0e47; ?>
<?php unset($__attributesOriginala2de13eefed6710e7b4064d57c6d0e47); ?>
<?php endif; ?>
<?php if (isset($__componentOriginala2de13eefed6710e7b4064d57c6d0e47)): ?>
<?php $component = $__componentOriginala2de13eefed6710e7b4064d57c6d0e47; ?>
<?php unset($__componentOriginala2de13eefed6710e7b4064d57c6d0e47); ?>
<?php endif; ?>
        </div>
    </div>
 <?php echo $__env->renderComponent(); ?>
<?php endif; ?>
<?php if (isset($__attributesOriginal74daf2d0a9c625ad90327a6043d15980)): ?>
<?php $attributes = $__attributesOriginal74daf2d0a9c625ad90327a6043d15980; ?>
<?php unset($__attributesOriginal74daf2d0a9c625ad90327a6043d15980); ?>
<?php endif; ?>
<?php if (isset($__componentOriginal74daf2d0a9c625ad90327a6043d15980)): ?>
<?php $component = $__componentOriginal74daf2d0a9c625ad90327a6043d15980; ?>
<?php unset($__componentOriginal74daf2d0a9c625ad90327a6043d15980); ?>
<?php endif; ?>
<?php /**PATH /Users/jherr/projects/tanstack/ai/examples/php-laravel/backend/vendor/laravel/framework/src/Illuminate/Foundation/Providers/../resources/exceptions/renderer/components/trace-and-editor.blade.php ENDPATH**/ ?>